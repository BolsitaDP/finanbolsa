import { describe, expect, it } from "vitest";

import {
  findMovementsBeforeReference,
  findOversplitTransactions,
  MAX_SAMPLE,
  type ReferenceAccount,
  type ReferencedMovement,
} from "@/lib/ledger-integrity";

/**
 * Estas funciones existen porque hay números que mienten sin dar error. Un test
 * que verifica "detecta el problema" es menos útil que uno que verifica **qué no
 * se reporta como problema**: un aviso que señala una cuenta sana hace que se
 * apague el aviso, que es exactamente lo contrario de lo que se busca aquí.
 */

const account = (over: Partial<ReferenceAccount> = {}): ReferenceAccount => ({
  id: "acc-1",
  name: "Cuenta principal",
  referenceDate: new Date(2026, 0, 1),
  ...over,
});

const movement = (over: Partial<ReferencedMovement> & { id: number }): ReferencedMovement => ({
  accountId: "acc-1",
  date: new Date(2026, 5, 15),
  amountMinor: -50_000,
  currency: "COP",
  description: "COMPRA",
  ...over,
});

describe("findMovementsBeforeReference", () => {
  it("finds movements the balance silently ignores", () => {
    // El caso: se importó un extracto de un periodo anterior a la fecha de
    // referencia. Esos movimientos salen en todas las estadísticas de gasto y no
    // suman ni un peso al saldo.
    const findings = findMovementsBeforeReference(
      [account()],
      [movement({ id: 1, date: new Date(2025, 10, 3) })]
    );

    expect(findings).toEqual([
      {
        accountId: "acc-1",
        accountName: "Cuenta principal",
        referenceDate: new Date(2026, 0, 1),
        count: 1,
        totalsByCurrency: { COP: 50_000 },
        sampleIds: [1],
      },
    ]);
  });

  it("counts a movement dated exactly on the reference date, which the balance also skips", () => {
    // La comparación del saldo es estrictamente mayor (`t.date > a.reference_date`),
    // así que el mismo día tampoco suma. Atraer solo "anteriores" dejaría fuera
    // justo el caso frontera, que es el más fácil de alcanzar: importar el
    // extracto del día en que se fijó la referencia.
    const findings = findMovementsBeforeReference(
      [account()],
      [movement({ id: 1, date: new Date(2026, 0, 1) })]
    );

    expect(findings[0].count).toBe(1);
  });

  it("stays quiet on a healthy ledger", () => {
    expect(
      findMovementsBeforeReference(
        [account()],
        [movement({ id: 1 }), movement({ id: 2, date: new Date(2026, 7, 30) })]
      )
    ).toEqual([]);
  });

  it("keeps currencies separate in the total", () => {
    // Una cuenta en pesos y una en dólares no se suman: el mismo criterio que
    // en el resto de la app, por la misma razón.
    const findings = findMovementsBeforeReference(
      [account()],
      [
        movement({ id: 1, date: new Date(2025, 10, 3) }),
        movement({ id: 2, date: new Date(2025, 10, 4), currency: "USD", amountMinor: -20 }),
      ]
    );

    expect(findings[0].totalsByCurrency).toEqual({ COP: 50_000, USD: 20 });
  });

  it("sums by absolute amount, so an income is not subtracted from the total", () => {
    // El total es "cuánta plata de esta fecha para atrás hay en la cuenta", no
    // "cuánto se gastó". Un ingreso con monto positivo y un gasto con monto
    // negativo cuentan los dos, y por eso la suma es en valor absoluto. (El signo
    // no se infiere del tipo aquí: esta función solo recibe el monto, y la
    // única pregunta que hace es cuánto movimiento hay que el saldo no está
    // contando.)
    const findings = findMovementsBeforeReference(
      [account()],
      [
        movement({ id: 1, date: new Date(2025, 10, 3), amountMinor: -50_000 }),
        movement({ id: 2, date: new Date(2025, 10, 4), amountMinor: 900_000 }),
      ]
    );

    expect(findings[0].totalsByCurrency.COP).toBe(950_000);
  });

  it("reports the account with the most affected movements first", () => {
    const findings = findMovementsBeforeReference(
      [
        account({ id: "acc-1", name: "Poca" }),
        account({ id: "acc-2", name: "Mucha" }),
      ],
      [
        movement({ id: 1, accountId: "acc-1", date: new Date(2025, 0, 1) }),
        movement({ id: 2, accountId: "acc-2", date: new Date(2025, 0, 1) }),
        movement({ id: 3, accountId: "acc-2", date: new Date(2025, 0, 2) }),
      ]
    );

    expect(findings.map((f) => f.accountName)).toEqual(["Mucha", "Poca"]);
  });

  it("caps the sample but keeps the real count", () => {
    // El conteo completo es lo que dice si el problema es de una fila o de cien;
    // la muestra es solo para poder abrir una y mirar.
    const many = Array.from({ length: 9 }, (_, i) =>
      movement({ id: i + 1, date: new Date(2025, 0, 1) })
    );
    const findings = findMovementsBeforeReference([account()], many);

    expect(findings[0].count).toBe(9);
    expect(findings[0].sampleIds).toHaveLength(MAX_SAMPLE);
  });

  it("ignores movements belonging to an account that no longer exists", () => {
    // Una fila huérfana no se puede arreglar desde la UI, así que reportarla
    // sería ruido. La FK debería impedirlo; esto es por si la base se editó a
    // mano.
    expect(
      findMovementsBeforeReference([account()], [movement({ id: 1, accountId: "acc-fantasma" })])
    ).toEqual([]);
  });

  it("returns nothing when there are no movements at all", () => {
    expect(findMovementsBeforeReference([account()], [])).toEqual([]);
  });
});

describe("findOversplitTransactions", () => {
  const row = (over: { transactionId: number; parentAmount: number; splits: number[] }) => ({
    transactionId: over.transactionId,
    currency: "COP",
    date: new Date(2026, 5, 15),
    description: "RETIRO",
    parentAmount: over.parentAmount,
    splits: over.splits.map((amountMinor) => ({ amountMinor })),
  });

  it("finds a breakdown that attributes more than the transaction", () => {
    // El bug que motivó esto: 150.000 + 80.000 sobre un retiro de 100.000. El
    // remanente negativo se descarta en `categoryAllocations` y las categorías
    // quedan reclamando 230.000.
    expect(
      findOversplitTransactions([row({ transactionId: 7, parentAmount: 100_000, splits: [150_000, 80_000] })])
    ).toEqual([
      {
        transactionId: 7,
        currency: "COP",
        month: "2026-06",
        description: "RETIRO",
        splitTotal: 230_000,
        parentAmount: 100_000,
        excessMinor: 130_000,
      },
    ]);
  });

  it("stays quiet on a breakdown that fits exactly", () => {
    // El borde que SÍ es legítimo: un desglose completo sin remanente es el
    // caso normal de un retiro de efectivo del que te acuerdas por partes.
    expect(
      findOversplitTransactions([row({ transactionId: 7, parentAmount: 100_000, splits: [60_000, 40_000] })])
    ).toEqual([]);
  });

  it("stays quiet on a partial breakdown, which leaves a remainder by design", () => {
    expect(
      findOversplitTransactions([row({ transactionId: 7, parentAmount: 100_000, splits: [30_000] })])
    ).toEqual([]);
  });

  it("compares against the absolute amount, so a negative transaction is not a false positive", () => {
    // Las transferencias se guardan con signo negativo. Sin el absoluto, cualquier
    // split sobre una transferencia parecería exceder el monto.
    expect(
      findOversplitTransactions([row({ transactionId: 7, parentAmount: -100_000, splits: [30_000] })])
    ).toEqual([]);
  });

  it("stays quiet when there are no splits", () => {
    expect(
      findOversplitTransactions([row({ transactionId: 7, parentAmount: 100_000, splits: [] })])
    ).toEqual([]);
  });

  it("reports the biggest excess first", () => {
    const findings = findOversplitTransactions([
      row({ transactionId: 1, parentAmount: 100_000, splits: [110_000] }),
      row({ transactionId: 2, parentAmount: 100_000, splits: [400_000] }),
    ]);

    expect(findings.map((f) => f.transactionId)).toEqual([2, 1]);
  });

  it("returns nothing on a healthy ledger", () => {
    expect(
      findOversplitTransactions([row({ transactionId: 1, parentAmount: 100_000, splits: [50_000] })])
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import {
  monthsSinceLastCharge,
  isStillCharging,
  willBillSoon,
  ACTIVE_WINDOW_DAYS,
} from "@/lib/recurring-projection";
import {
  planChargeForMonth,
  recordedSignature,
  toRecurringTemplate,
} from "@/lib/recurring-template";
import type { RecurringTemplate } from "@/lib/recurring-template";

/**
 * La plantilla convierte el informe en herramienta, y el riesgo está en el otro
 * lado: crear un movimiento equivocado es peor que no crear nada. Casi todos
 * los tests de aquí son sobre los casos en que **no** se ofrece el botón.
 */

const TODAY = new Date(2026, 8, 20); // 20 de septiembre de 2026

/** La clave del grupo, como la derivaría `recurringGroupKey`. */
const PAYEE_KEY = "payee:payee-netflix";
const SPOTIFY_KEY = "payee:payee-spotify";

const template = (over: Partial<RecurringTemplate> = {}): RecurringTemplate => ({
  key: "payee:payee-netflix",
  label: "Netflix",
  currency: "COP",
  accountId: "acc-1",
  categoryId: "cat-entretenimiento",
  payeeId: "payee-netflix",
  latestAmountMinor: 42_000,
  // 41 días atrás: dentro de la ventana de 45. Con 46 (el día 5 de agosto
  // visto el 20 de septiembre) el recurrente ya daría por cancelado.
  lastDate: new Date(2026, 7, 10),
  medianIntervalDays: 30,
  dayOfMonth: 5,
  ...over,
});

const plan = (t: RecurringTemplate, recorded: string[] = [], today = TODAY) =>
  planChargeForMonth(t, today, new Set(recorded));

describe("monthsSinceLastCharge", () => {
  it("counts whole months back", () => {
    expect(monthsSinceLastCharge(new Date(2026, 5, 20), TODAY)).toBe(3);
  });

  it("counts the same month as zero, not as minus one", () => {
    // Un cargo del día 20 visto el día 25 no es "hace un mes", es "este mes".
    expect(monthsSinceLastCharge(new Date(2026, 8, 5), new Date(2026, 8, 25))).toBe(0);
  });

  it("uses the calendar month, not the day of the month", () => {
    // Un cargo del 25 de julio visto el 20 de agosto es "hace un mes" —su mes
    // fue julio— y no "hace cero meses", que es lo que daría un ajuste por día.
    // Y uno de este mes da 0, que es lo que el usuario quiere ver.
    expect(monthsSinceLastCharge(new Date(2026, 8, 5), new Date(2026, 8, 20))).toBe(0);
    expect(monthsSinceLastCharge(new Date(2026, 7, 25), new Date(2026, 8, 20))).toBe(1);
    expect(monthsSinceLastCharge(new Date(2026, 7, 2), new Date(2026, 8, 28))).toBe(1);
  });

  it("never returns a negative number for a charge later this month", () => {
    expect(monthsSinceLastCharge(new Date(2026, 8, 28), new Date(2026, 8, 3))).toBe(0);
  });
});

describe("isStillCharging", () => {
  it("tolerates a whole missed cycle, which is when the register button matters", () => {
    // El bug que encontró la verificación de punta a punta. Una suscripción que
    // cobra el día 5, revisada el día 20 del mes siguiente, está a 46 días de la
    // anterior — y está perfectamente viva: lo que no se ha registrado es el
    // cargo del 5. Con un umbral fijo de 45 días el botón para registrarlo se
    // escondía justo cuando hacía falta.
    expect(isStillCharging(new Date(2026, 7, 5), TODAY, 30)).toBe(true);
  });

  it("declares it cancelled only after two full cycles of silence", () => {
    expect(isStillCharging(new Date(2026, 6, 5), TODAY, 30)).toBe(false);
  });

  it("scales with each subscription's own interval, not a fixed number of days", () => {
    // Un cargo semanal necesita una tolerancia mucho más corta que uno mensual;
    // un único número tendría que ser corto para uno y largo para el otro, que
    // es como un solo umbral acaba sirviendo para dos preguntas distintas.
    const last = new Date(2026, 8, 1);
    expect(isStillCharging(last, TODAY, 7)).toBe(false);
    expect(isStillCharging(last, TODAY, 30)).toBe(true);
  });

  it("falls back to a fixed window when there is no interval to scale by", () => {
    expect(isStillCharging(new Date(2026, 7, 15), TODAY, null)).toBe(true);
    expect(isStillCharging(new Date(2026, 4, 1), TODAY, null)).toBe(false);
    expect(ACTIVE_WINDOW_DAYS).toBe(45);
  });
});

describe("willBillSoon", () => {
  it("is stricter than still-charging, because predicting takes more evidence", () => {
    // Sigue viva la suscripción, pero su próximo cobro ya no se predice: se
    // declara atrasado. Afirmar que va a pasar con seis semanas de silencio no es
    // una predicción.
    expect(isStillCharging(new Date(2026, 7, 5), TODAY, 30)).toBe(true);
    expect(willBillSoon(new Date(2026, 7, 5), TODAY, 30)).toBe(false);
    expect(willBillSoon(new Date(2026, 7, 25), TODAY, 30)).toBe(true);
  });
});

describe("planChargeForMonth", () => {
  it("takes the payee from the group key, not from a second source", () => {
    // El payee vive dentro de la clave del grupo. `RecurringGroup` no lo guarda
    // por separado, así que derivarlo otra vez en la página sería una cuarta
    // forma de preguntar lo mismo, y la forma de que se desincronicen.
    const fromKey = toRecurringTemplate(
      { ...template(), key: PAYEE_KEY, label: "Netflix" },
      (key) => (key.startsWith("payee:") ? key.slice(6) : null)
    );
    expect(fromKey.payeeId).toBe("payee-netflix");

    // Un grupo armado por descripción no tiene payee, y no debe inventar uno.
    const fromDescription = toRecurringTemplate(
      { ...template(), key: "desc:exito", label: "Exito" },
      (key) => (key.startsWith("payee:") ? key.slice(6) : null)
    );
    expect(fromDescription.payeeId).toBeNull();
  });

  it("proposes the charge with the day, amount, account and category already known", () => {
    // Todo lo que el botón evita que el usuario escriba a mano, y todo lo que la
    // app no puede deducir sola: la fecha, el monto, la cuenta, la categoría.
    const result = plan(template());

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.charge).toEqual({
      date: new Date(2026, 8, 5),
      amountMinor: 42_000,
      currency: "COP",
      accountId: "acc-1",
      categoryId: "cat-entretenimiento",
      payeeId: "payee-netflix",
      description: "Netflix",
      dateNote: "expected-day",
    });
  });

  it("offers nothing before the charge is due", () => {
    // El día 3, una suscripción que cobra el 5 todavía no pasó. Este botón no
    // crea movimientos futuros — el problema que `recurring-template.ts` existe
    // para no tener — y lo que no ha ocurrido ya sale en la tarjeta de gastos
    // previstos con su fecha.
    const result = plan(template(), [], new Date(2026, 8, 3));

    expect(result).toMatchObject({ kind: "not-due-yet" });
    if (result.kind !== "not-due-yet") return;
    expect(result.dueDate).toEqual(new Date(2026, 8, 5));
  });

  it("offers the charge when the last one is more than 45 days old", () => {
    // El bug que encontró la verificación de punta a punta. `planChargeForMonth`
    // llamaba a `isStillCharging` sin el intervalo, así que caía al umbral fijo de
    // 45 días y una suscripción del día 5 revisada el día 20 — 46 días — daba
    // "cancelada" justo cuando lo que falta es registrar el cargo del 5.
    // Un umbral que no se puede equivocar sin que un test lo note es la única
    // defensa contra que dos preguntas distintas compartan un número.
    const late = template({ lastDate: new Date(2026, 7, 5) });

    expect(TODAY.getTime() - late.lastDate.getTime()).toBeGreaterThan(45 * 86_400_000);
    const result = plan(late);

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.charge.date).toEqual(new Date(2026, 8, 5));
  });

  it("offers nothing for a subscription that stopped charging", () => {
    // Cancelado hace cuatro meses. No hay nada que registrar y el botón sería
    // trabajo inventado.
    const result = plan(template({ lastDate: new Date(2026, 4, 5) }));

    expect(result).toMatchObject({ kind: "not-charging", monthsAgo: 4 });
  });

  it("offers nothing when the month already has a matching charge", () => {
    // El doble clic, y también el caso en que el banco cobró el 3 y el usuario
    // lo registró el 5: la firma se compara a nivel de mes justamente para eso.
    const recorded = [recordedSignature(new Date(2026, 8, 5), 42_000, PAYEE_KEY)];

    expect(plan(template(), recorded).kind).toBe("already-recorded");
  });

  it("does not treat a different amount as the same charge", () => {
    // El precio subió a 42.000 este mes y el mes pasado se registró a 35.000. Son
    // cargos distintos y el de este mes falta.
    const recorded = [recordedSignature(new Date(2026, 8, 5), 35_000, PAYEE_KEY)];

    expect(plan(template(), recorded).kind).toBe("ready");
  });

  it("does not treat the same amount for another subscription as the same charge", () => {
    const recorded = [recordedSignature(new Date(2026, 8, 5), 42_000, SPOTIFY_KEY)];

    expect(plan(template(), recorded).kind).toBe("ready");
  });

  it("refuses without an account rather than guessing one", () => {
    // Es la única cosa que la app no puede deducir del histórico, y crearlo en
    // la cuenta equivocada es peor que no crearlo: el saldo queda mal y no hay
    // señal de por qué.
    expect(plan(template({ accountId: null })).kind).toBe("needs-account");
  });

  it("refuses when there is no consistent day of the month", () => {
    // Una fecha inventada es exactamente el trabajo que la feature quita.
    expect(plan(template({ dayOfMonth: null })).kind).toBe("no-day");
  });

  it("clamps a day the month does not have, and says so", () => {
    // Netflix cobra el 31. En septiembre no existe: se propone el 30 y la nota
    // explica por qué, en vez de dejar una fecha que parece un error. El 30 sí
    // cuenta como hoy, así que el plan se ofrece; el 20 todavía no habría pasado.
    const result = plan(
      // Último cargo hace 29 días: dentro de la ventana de 45, que se comprueba
      // antes que la fecha.
      template({ dayOfMonth: 31, lastDate: new Date(2026, 8, 1) }),
      [],
      new Date(2026, 8, 30)
    );

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.charge.date).toEqual(new Date(2026, 8, 30));
    expect(result.charge.dateNote).toBe("clamped-to-month-end");
  });

  it("handles February in a leap year", () => {
    // 2024 es bisiesto: el 31 de febrero es el 29, y ese día sí cuenta como
    // vencido.
    const result = plan(
      template({ dayOfMonth: 31, lastDate: new Date(2024, 0, 25) }),
      [],
      new Date(2024, 1, 29)
    );

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.charge.date).toEqual(new Date(2024, 1, 29));
  });

  it("charges the day it was due, not the day the user happens to look", () => {
    // El banco cobró el 5 y el usuario abre la app el 20. Ponerle la fecha de
    // hoy movería el gasto de mes, y con él el presupuesto.
    const result = plan(template(), [], new Date(2026, 8, 20));

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.charge.date.getDate()).toBe(5);
  });

  it("ignores the amount's sign, which depends on how the row was written", () => {
    const recorded = [recordedSignature(new Date(2026, 8, 5), -42_000, PAYEE_KEY)];

    expect(plan(template(), recorded).kind).toBe("already-recorded");
  });
});

import { describe, expect, it } from "vitest";

import {
  findDuplicates,
  summarizeDuplicates,
  MAX_REPORTED_DUPLICATES,
  type DuplicateCandidate,
  type DuplicateDraft,
} from "@/lib/duplicate-check";

/**
 * La entrada manual no tiene extractor que la proteja. El importador compara
 * contra la descripción que puso el banco; aquí la descripción es texto libre
 * que alguien escribió, así que la pregunta no es "¿es la misma fila?" sino
 * "¿es esto suficientemente parecido como para preguntar?".
 *
 * Y esa asimetría es el riesgo: un aviso que se equivoca hace perder la
 * confianza en todos los avisos, y un aviso que falta deja un saldo que no
 * cuadra. Los tests de aquí cubren las dos.
 */

/** Mediodía local, como en el resto de la suite: la fecha es local a propósito. */
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

const row = (over: Partial<DuplicateCandidate> & { id: number }): DuplicateCandidate => ({
  date: day(2026, 8, 31),
  amountMinor: 22_500,
  currency: "COP",
  payeeId: null,
  description: null,
  ...over,
});

const draft = (over: Partial<DuplicateDraft> = {}): DuplicateDraft => ({
  date: day(2026, 8, 31),
  amountMinor: 22_500,
  currency: "COP",
  payeeId: null,
  description: null,
  ...over,
});

describe("findDuplicates", () => {
  it("finds an identical charge entered twice", () => {
    const existing = [row({ id: 7, payeeId: "pay-rappi" })];

    expect(findDuplicates(draft({ payeeId: "pay-rappi" }), existing)).toEqual([
      { id: 7, confidence: "exact" },
    ]);
  });

  it("marks a same-day same-amount charge with no merchant as only likely", () => {
    // Dos cafés el mismo día son dos cafés. Por eso esto avisa y no bloquea: la
    // diferencia entre "esto ya está" y "esto se parece" es la que decide si el
    // usuario guarda o no.
    const existing = [row({ id: 7, description: "CAFE" })];

    expect(findDuplicates(draft(), existing)).toEqual([{ id: 7, confidence: "likely" }]);
  });

  it("accepts a matching description as exact, for entries with no payee", () => {
    // En captura manual es normal no tener comercio, y la descripción es lo
    // único comparable. Sin esta regla, casi todo lo capturado a mano saldría
    // como "probable" y el aviso perdería valor.
    const existing = [row({ id: 7, description: "  Compra   en Exito " })];

    expect(
      findDuplicates(draft({ description: "compra en exito" }), existing)
    ).toEqual([{ id: 7, confidence: "exact" }]);
  });

  it("ignores a different amount on the same day", () => {
    expect(findDuplicates(draft({ amountMinor: 30_000 }), [row({ id: 7 })])).toEqual([]);
  });

  it("ignores the same amount on a different day", () => {
    expect(findDuplicates(draft(), [row({ id: 7, date: day(2026, 8, 30) })])).toEqual([]);
  });

  it("ignores a different currency, because the amounts are not comparable", () => {
    // 22.500 pesos y 22.500 dólares no son el mismo movimiento, y la app no tiene
    // conversión activada por defecto para comparar nada.
    expect(findDuplicates(draft(), [row({ id: 7, currency: "USD" })])).toEqual([]);
  });

  it("excludes the row being edited, which would always match itself", () => {
    const existing = [row({ id: 7, payeeId: "pay-rappi" })];

    expect(findDuplicates(draft({ id: 7, payeeId: "pay-rappi" }), existing)).toEqual([]);
    // Pero otra fila igual sí se ve: editar una no debe callar a la otra.
    expect(
      findDuplicates(draft({ id: 99, payeeId: "pay-rappi" }), [existing[0], row({ id: 8, payeeId: "pay-rappi" })])
    ).toHaveLength(2);
  });

  it("compares the date in local time, not UTC", () => {
    // Un movimiento escrito a las 8 de la noche del 31 en Colombia es el 31 en
    // local. `toISOString()` lo daría como 1 de septiembre, y compararía el
    // movimiento de hoy contra los de mañana — el mismo error de §3.1, aplicado
    // a un aviso en vez de a un CSV.
    const existing = [row({ id: 7, date: day(2026, 8, 31, 20) })];

    expect(findDuplicates(draft({ date: day(2026, 8, 31, 9) }), existing)).toHaveLength(1);
  });

  it("still matches across the UTC midnight boundary", () => {
    // El reverso del caso anterior: las 11 de la noche del 31 en UTC ya es el 1
    // de septiembre, pero en hora local sigue siendo 31, y el movimiento existe
    // el 31.
    const existing = [row({ id: 7, date: new Date(Date.UTC(2026, 7, 31, 23, 30)) })];

    expect(findDuplicates(draft({ date: day(2026, 8, 31, 12) }), existing)).toHaveLength(1);
  });

  it("compares amounts by absolute value, so a transfer is not its own duplicate", () => {
    // Las transferencias se guardan con signo negativo y los gastos con signo
    // positivo. El mismo movimiento en las dos mitades de la app tiene que
    // compararse consigo mismo, no pasar por dos cargos distintos.
    const existing = [row({ id: 7, amountMinor: -22_500, payeeId: "pay-rappi" })];

    expect(findDuplicates(draft({ amountMinor: 22_500, payeeId: "pay-rappi" }), existing)).toHaveLength(1);
  });

  it("returns every match, not just the first", () => {
    // El caso del presupuesto del importador, al revés: aquí no se descarta
    // nada, se informa. Un doble clic mal dado dos veces tiene que mostrar dos
    // filas, no una.
    const existing = [row({ id: 7 }), row({ id: 8 }), row({ id: 9 })];

    expect(findDuplicates(draft(), existing)).toHaveLength(3);
  });

  it("puts exact matches first, since those are the ones being decided about", () => {
    const existing = [
      row({ id: 7, description: "otra cosa" }),
      row({ id: 8, payeeId: "pay-rappi" }),
    ];

    expect(findDuplicates(draft({ payeeId: "pay-rappi" }), existing).map((m) => m.confidence)).toEqual([
      "exact",
      "likely",
    ]);
  });

  it("returns nothing when there is no match", () => {
    expect(findDuplicates(draft(), [])).toEqual([]);
    expect(findDuplicates(draft(), [row({ id: 7, amountMinor: 1_000 })])).toEqual([]);
  });
});

describe("summarizeDuplicates", () => {
  it("returns null when there is nothing to warn about", () => {
    expect(summarizeDuplicates([])).toBeNull();
  });

  it("reports the matches and whether any is exact", () => {
    const warning = summarizeDuplicates([
      { id: 7, confidence: "likely" },
      { id: 8, confidence: "exact" },
    ]);

    expect(warning).toMatchObject({ extraCount: 0, hasExact: true });
    expect(warning!.matches).toHaveLength(2);
  });

  it("caps the list and counts what it left out", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: i, confidence: "likely" as const }));
    const warning = summarizeDuplicates(many);

    expect(warning!.matches).toHaveLength(MAX_REPORTED_DUPLICATES);
    expect(warning!.extraCount).toBe(4);
  });

  it("flags an all-likely warning as not exact", () => {
    // La diferencia entre el texto del aviso: con una coincidencia exacta se
    // puede decir "esto ya está"; con tres probables hay que decir que se parece.
    expect(summarizeDuplicates([{ id: 1, confidence: "likely" }])!.hasExact).toBe(false);
  });
});

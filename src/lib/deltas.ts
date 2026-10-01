/**
 * La comparación mes contra mes, para cualquier dimensión.
 *
 * "Categorías" y "comercios" son la misma pregunta con otra clave de agrupación,
 * y la parte que puede estar mal no es la aritmética sino las dos decisiones que
 * la rodean: qué entra cuando algo desaparece, y qué pasa cuando se mezclan
 * monedas. Esas dos reglas viven aquí una sola vez.
 *
 * Puro a propósito: sin imports de Next ni de la base de datos, para que los
 * tests la alcancen sin levantar nada.
 */

/** Una fila de agregado tal como la devuelve un `GROUP BY`: clave, moneda, total. */
export type DeltaInput<K> = { key: K; currency: string; amountMinor: number };

export type Delta<K> = {
  key: K;
  currency: string;
  current: number;
  previous: number;
  delta: number;
};

/**
 * Compara dos meses y devuelve las claves ordenadas por lo que MÁS subió.
 *
 * Ordenar por delta descendente pone arriba lo que más dolió, que es lo que uno
 * busca al abrir la app. Los descensos aparecen al final, con su propio signo.
 */
export function buildDeltas<K>(
  current: DeltaInput<K>[],
  previous: DeltaInput<K>[],
  limit: number
): Delta<K>[] {
  // La clave incluye la moneda a propósito: el mismo comercio en pesos y en
  // dólares son dos líneas, no una suma. Un dólar no es un peso, y sumarlos sin
  // tasa es exactamente el error que hacía que el presupuesto mintiera en
  // silencio (ROADMAP §0.7b).
  const key = (row: DeltaInput<K>) => `${row.key}|${row.currency}`;
  const before = new Map(previous.map((entry) => [key(entry), entry.amountMinor]));

  const deltas: Delta<K>[] = current.map((entry) => {
    const prior = before.get(key(entry)) ?? 0;
    return {
      key: entry.key,
      currency: entry.currency,
      current: entry.amountMinor,
      previous: prior,
      delta: entry.amountMinor - prior,
    };
  });

  // Lo que existió el mes pasado y desapareció este también es una respuesta
  // ("dejé de gastar en esto"), así que entra con delta negativo. Sin esto el
  // gasto total solo podría subir, y la tarjeta mentiría sobre lo que mejor
  // hiciste.
  const currentKeys = new Set(current.map(key));
  for (const entry of previous) {
    if (currentKeys.has(key(entry))) continue;
    deltas.push({
      key: entry.key,
      currency: entry.currency,
      current: 0,
      previous: entry.amountMinor,
      delta: -entry.amountMinor,
    });
  }

  return deltas.sort((a, b) => b.delta - a.delta).slice(0, limit);
}

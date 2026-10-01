/**
 * "Este mes gastaste 3,2x tu promedio en Compras" — ROADMAP §1.3.
 *
 * La comparación mes contra mes que ya está en el dashboard compara contra **un**
 * mes. Un solo mes no es una base: una categoría normal se ve rara cualquier mes
 * que le toque, y el promedio de seis meses es lo que separa "subió" de "se te
 * fue de las manos".
 *
 * Puro y sin imports de Next ni de la base de datos. Todo lo difícil está aquí y
 * no en el JSX: qué mes cuenta como base, qué se hace con un mes a medio
 * terminar, y qué hacer con una categoría que siempre es irregular.
 */

/** Una fila por (categoría, mes, moneda), tal como la devuelve el `GROUP BY`. */
export type MonthlySpend = {
  categoryId: string;
  currency: string;
  month: string;
  amountMinor: number;
};

export type SpendOutlier = {
  categoryId: string;
  currency: string;
  current: number;
  /** Promedio de los meses previos con gasto, sin proratear. */
  baseline: number;
  /** `current / baseline`, ya prorateado. El número que se muestra. */
  ratio: number;
  /** Cuántos meses previos con gasto entraron en el promedio. */
  monthsInBaseline: number;
};

/** Ventana de referencia. Seis meses es lo que hace falta para que un mes aberrant no sea el promedio. */
export const BASELINE_MONTHS = 6;

/**
 * Cuántos meses con gasto hacen falta para un promedio.
 *
 * Dos no: el promedio de dos meses es un mes malo y un mes bueno, y cualquier
 * cosa se vería como una anomalía. Tres es el mínimo en el que "promedio" empieza
 * a significar algo.
 */
export const MIN_MONTHS_IN_BASELINE = 3;

/**
 * Cuántas veces el mes en curso tiene que superar la base.
 *
 * 3x, no 1,5x. La tarjeta de al lado ya cubre el mes contra mes y el cambio
 * pequeño; lo que falta aquí es lo otro, la fuga. Umbral bajo = una tarjeta que
 * siempre tiene algo que avisar, que es una tarjeta que nadie lee.
 */
export const OUTLIER_RATIO = 3;

/**
 * Tope de variación de la base para que un mes alto signifique algo.
 *
 * Una categoría que va de 0 a 300.000 y vuelve a 0 tiene un promedio bajo y
 * cualquier mes normal parecería una anomalía. Con este tope, "Regalos" y
 * "Reparaciones" — que son irregulares por naturaleza — no generan alertas, y
 * solo avisan las categorías con una base estable que se salieron de ella.
 *
 * El mismo razonamiento que el coeficiente de variación de `detectRecurring`,
 * que separa una suscripción de una parada frecuente.
 */
export const MAX_BASELINE_COEFFICIENT_OF_VARIATION = 0.6;

function mean(values: number[]) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function coefficientOfVariation(values: number[]) {
  const avg = mean(values);
  if (avg === 0) return 0;
  const variance = mean(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance) / avg;
}

/**
 * ¿Qué proporción del mes ya pasó?
 *
 * Sin esto la alerta llega tarde, o nunca. Comparar el gasto del mes en curso
 * contra meses completos subestima el mes a la mitad: el día 15 una categoría
 * que va 650.000 sobre una base de 200.000 da 3,25x — que ya dispara — pero una
 * que va a terminar en 1.300.000 da 3,25x recién el día 30, cuando ya no hay
 * nada que hacer con el dato. Prorateando la base con la misma fracción, la
 * comparación es entre periodos del mismo tamaño y la fuga se ve cuando todavía
 * se puede actuar sobre ella.
 *
 * El mes en curso tampoco dispara por haber arrancado: el día 3 casi todo está
 * por debajo de su base prorateada, y el día 1 la fracción es 1/31, nunca cero
 * (una base de cero daría una ratio infinita).
 *
 * **El supuesto es que el gasto se reparte parejo durante el mes**, y no siempre
 * es cierto: un arriendo que cae el día 1 hace que el mes se vea enorme en
 * enero y vacío en febrero. Se acepta porque el caso común —comida, transporte,
 * compras— sí se reparte, y porque un supuesto declarado y visible es mejor que
 * una alarma constante. `elapsedFraction` lo recibe el caller para que el ajuste
 * sea visible en los tests en vez de estar escondido en un `new Date()`.
 */
export function monthElapsedFraction(now: Date, month: string): number {
  const [year, m] = month.split("-").map(Number);
  const daysInMonth = new Date(year, m, 0).getDate();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === m;
  // Un mes que ya terminó está completo, y uno que empieza vale 1 día: nunca
  // cero, que haría la base cero y la ratio infinita.
  const day = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
  return Math.max(day / daysInMonth, 1 / daysInMonth);
}

/**
 * Categorías cuyo gasto del mes en curso se sale de lo normal.
 *
 * Se calcula por moneda: sumar pesos y dólares en un mismo promedio daría una
 * línea que no significa nada, que es el error que el presupuesto cometía
 * (ROADMAP §0.7b).
 *
 * El orden es por **exceso sobre la base**, no por ratio: entre "Transporte 4x
 * sobre una base de 20.000" y "Compras 3,2x sobre una base de 400.000", el
 * segundo es el que vale la pena mirar, y el ratio los pone en el orden
 * equivocado.
 */
export function detectSpendOutliers(
  history: MonthlySpend[],
  options: {
    currentMonth: string;
    /** Meses anteriores que entran en la base, en orden reciente-primero. */
    baselineMonths: string[];
    elapsedFraction: number;
    limit?: number;
  }
): SpendOutlier[] {
  const { currentMonth, baselineMonths, elapsedFraction, limit = 3 } = options;
  const baselineSet = new Set(baselineMonths);

  // Bucket por (categoría, moneda), separando el mes en curso de la base. Un
  // mes que no está en ninguna de las dos listas se ignora: la función recibe
  // justo los doce que necesita y nada más.
  const current = new Map<string, number>();
  const base = new Map<string, number[]>();
  for (const row of history) {
    const key = `${row.categoryId}|${row.currency}`;
    if (row.month === currentMonth) {
      current.set(key, (current.get(key) ?? 0) + row.amountMinor);
    } else if (baselineSet.has(row.month)) {
      const list = base.get(key) ?? [];
      list.push(row.amountMinor);
      base.set(key, list);
    }
  }

  const outliers: SpendOutlier[] = [];
  for (const [key, currentAmount] of current) {
    // Una categoría con gasto este mes y sin historia previa no tiene contra qué
    // compararse: es nueva, y "nueva" no es "anómala".
    const priorMonths = (base.get(key) ?? []).filter((amount) => amount > 0);
    if (priorMonths.length < MIN_MONTHS_IN_BASELINE) continue;
    if (coefficientOfVariation(priorMonths) > MAX_BASELINE_COEFFICIENT_OF_VARIATION) continue;

    const baseline = mean(priorMonths);
    if (baseline <= 0) continue;

    const proratedBaseline = baseline * elapsedFraction;
    if (proratedBaseline <= 0) continue;
    const ratio = currentAmount / proratedBaseline;
    // Estricto, no inclusivo. Una categoría exactamente en 3,00x es una
    // coincidencia de números — 2,99x y 3,01x son la misma realidad — y el
    // objetivo de la tarjeta es que se calle. El ejemplo del ROADMAP ("3,2x")
    // sigue entrando de sobra.
    if (ratio <= OUTLIER_RATIO) continue;

    const [categoryId, currency] = key.split("|");
    outliers.push({
      categoryId,
      currency,
      current: currentAmount,
      baseline,
      ratio,
      monthsInBaseline: priorMonths.length,
    });
  }

  return outliers
    .sort((a, b) => b.current - b.baseline - (a.current - a.baseline))
    .slice(0, limit);
}

/**
 * Currency conversion.
 *
 * Until this existed, the budget page filtered `where currency = baseCurrency`
 * and every transaction in another currency simply vanished — silently. A USD
 * expense never came out of a COP envelope, and the app reported you were on
 * budget when you were not. That is the worst kind of financial bug: it gives
 * you confidence.
 *
 * So the rule here is explicit: a conversion either uses a rate that exists for
 * that month, or it returns null and the caller says so. Nothing is ever
 * silently dropped, and nothing is ever converted with an assumed rate of 1.
 */

export type RateRow = {
  month: string; // 'YYYY-MM'
  fromCurrency: string;
  toCurrency: string;
  rate: number;
};

/** month -> "FROM>TO" -> rate */
export type RateIndex = Map<string, Map<string, number>>;

export const pairKey = (from: string, to: string) => `${from}>${to}`;

/** Builds the lookup from the exchange_rates rows. */
export function buildRateIndex(rows: RateRow[]): RateIndex {
  const index: RateIndex = new Map();
  for (const row of rows) {
    if (!(row.rate > 0)) continue; // a zero or negative rate is meaningless
    const byMonth = index.get(row.month) ?? new Map<string, number>();
    byMonth.set(pairKey(row.fromCurrency, row.toCurrency), row.rate);
    index.set(row.month, byMonth);
  }
  return index;
}

/**
 * The rate for a pair in a given month.
 *
 * Falls back to the most recent earlier month, because a TRM set on the 1st
 * legitimately covers the whole month and nobody wants to re-enter it weekly.
 * Never falls back *forward*: using a future rate for past spending would
 * retroactively change numbers that were already reported.
 */
export function rateFor(
  index: RateIndex,
  month: string,
  from: string,
  to: string
): number | null {
  if (from === to) return 1;
  const months = [...index.keys()].filter((m) => m <= month).sort().reverse();
  for (const m of months) {
    const rate = index.get(m)?.get(pairKey(from, to));
    if (rate) return rate;
    // A rate stored the other way round is inverted rather than ignored, so
    // entering "1 COP = 0.00025 USD" also works for COP -> USD.
    const inverse = index.get(m)?.get(pairKey(to, from));
    if (inverse) return 1 / inverse;
  }
  return null;
}

/** Converts an amount, or returns null when no rate is known. */
export function convert(
  amount: number,
  from: string,
  to: string,
  index: RateIndex,
  month: string
): number | null {
  const rate = rateFor(index, month, from, to);
  if (rate === null) return null;
  return amount * rate;
}

export type MissingRate = { month: string; from: string; to: string };

/**
 * Which conversions a set of amounts would need but cannot do.
 *
 * Returned to the caller so the UI can say "faltan las tasas de USD para
 * agosto" instead of quietly reporting a smaller number. `months` should be
 * the periods actually being totalled, so a missing rate for an old month
 * doesn't produce a warning for a month nobody is looking at.
 */
export function missingRates(
  amounts: { month: string; currency: string }[],
  index: RateIndex,
  baseCurrency: string
): MissingRate[] {
  const missing = new Map<string, MissingRate>();
  for (const { month, currency } of amounts) {
    if (currency === baseCurrency) continue;
    if (rateFor(index, month, currency, baseCurrency) !== null) continue;
    const key = `${month}|${currency}|${baseCurrency}`;
    missing.set(key, { month, from: currency, to: baseCurrency });
  }
  return [...missing.values()].sort((a, b) =>
    a.month === b.month ? a.from.localeCompare(b.from) : a.month.localeCompare(b.month)
  );
}

/**
 * Converts a list of amounts, reporting the unconvertible ones separately
 * instead of folding them into a total that is quietly too small.
 */
export function convertAll<T extends { month: string; currency: string; amount: number }>(
  items: T[],
  index: RateIndex,
  baseCurrency: string
): { total: number; converted: T[]; skipped: T[] } {
  const converted: T[] = [];
  const skipped: T[] = [];
  let total = 0;
  for (const item of items) {
    const value = convert(item.amount, item.currency, baseCurrency, index, item.month);
    if (value === null) {
      skipped.push(item);
      continue;
    }
    total += value;
    converted.push(item);
  }
  return { total, converted, skipped };
}

/** Human-readable label for a missing rate, e.g. "USD → COP en agosto de 2026". */
export function describeMissingRate(m: MissingRate): string {
  const [y, mo] = m.month.split("-").map(Number);
  const monthName = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(
    new Date(y, mo - 1, 1)
  );
  return `${m.from} → ${m.to} en ${monthName}`;
}

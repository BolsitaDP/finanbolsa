/**
 * "A dónde fue mi plata" — one sentence instead of four cards.
 *
 * The dashboard already has the totals, the comparison and the biggest mover;
 * what it lacks is the sentence a person actually wants: how much, versus
 * last month, and what caused the difference. Numbers that require arithmetic
 * to interpret are the same as numbers that weren't shown.
 *
 * Pure and separate from the component so the phrasing rules can be tested
 * without rendering anything. The awkward cases are all here, not in JSX:
 * division by zero on a percentage, a first month with nothing to compare
 * against, a currency whose spend vanished entirely.
 */

export type MonthSummary = {
  /**
   * Pre-formatted month names, e.g. "agosto de 2026".
   *
   * Labels rather than 'YYYY-MM' keys because the sentence should read like
   * Spanish, not like a database column — and because the caller is the only
   * place that knows how to phrase a date in this app's locale.
   */
  currentLabel: string;
  previousLabel: string;
  currency: string;
  currentTotal: number;
  previousTotal: number;
  /** Biggest increase, if any category went up at all. */
  topIncrease: { name: string; amountMinor: number } | null;
  /** Biggest decrease, if any category went down at all. */
  topDecrease: { name: string; amountMinor: number } | null;
};

/** es-CO, matching formatMoney: no decimals, thousands separated by a dot. */
function amount(value: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.abs(value));
}

function money(value: number, currency: string): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$ ${amount(value)} ${currency}`;
}

/**
 * The same amount without the currency code.
 *
 * The sentence has already named the currency once; repeating "COP" in every
 * clause turns a glanceable line into something to be read.
 */
function moneyShort(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$ ${amount(value)}`;
}

/**
 * A percentage only when the base is non-zero. A category that did not exist
 * last month has no percentage, and "Infinity%" is worse than saying nothing.
 */
function percentChange(current: number, previous: number): string | null {
  if (previous === 0) return null;
  return `${Math.abs(((current - previous) / previous) * 100).toFixed(0)}%`;
}

export function summarizeMonth(summary: MonthSummary): string {
  const { currentTotal, previousTotal, currency, topIncrease, topDecrease } = summary;

  const change = currentTotal - previousTotal;
  const percent = percentChange(currentTotal, previousTotal);

  // First month with nothing to compare against: no comparison is possible, and
  // inventing "0% more than nothing" would be noise dressed as information.
  if (previousTotal === 0 && currentTotal === 0) {
    return `No hubo gasto en ${currency}.`;
  }
  if (previousTotal === 0) {
    return `En ${summary.currentLabel} gastaste ${money(currentTotal, currency)}. No hay mes anterior con qué comparar.`;
  }
  if (currentTotal === 0) {
    return `No gastaste nada en ${summary.currentLabel}; en ${summary.previousLabel} fueron ${money(previousTotal, currency)}.`;
  }

  const head = `En ${summary.currentLabel} gastaste ${money(currentTotal, currency)}`;

  if (change === 0) {
    return `${head}, exactamente igual que en ${summary.previousLabel}.`;
  }

  const direction = change > 0 ? "más" : "menos";
  const amountPart = percent ? `${percent} ${direction}` : direction;
  const sentences = [`${head}, ${amountPart} que en ${summary.previousLabel}.`];

  // Only one cause is named. Naming three would be a list, and a list is what
  // the card below already is; the sentence is here to be read at a glance.
  if (topIncrease && topIncrease.amountMinor > 0) {
    sentences.push(
      `El mayor incremento fue ${topIncrease.name} (+${moneyShort(topIncrease.amountMinor)}).`
    );
  } else if (topDecrease && topDecrease.amountMinor < 0) {
    sentences.push(
      `Lo que más bajó fue ${topDecrease.name} (${moneyShort(topDecrease.amountMinor)}).`
    );
  }

  return sentences.join(" ");
}

import { monthKey } from "@/lib/month";

/**
 * The only fields detection reads. Narrower than a full transaction row, so
 * the query feeding it can skip the eleven columns nothing looks at — see
 * `recurringCandidates` in aggregates.ts.
 *
 * `type` is kept even though the query filters on it, so that passing an
 * unfiltered list still behaves: detection is defensive about what it is given.
 */
export type RecurringCandidate = {
  id: number;
  type: string;
  date: Date;
  amountMinor: number;
  currency: string;
  categoryId: string | null;
  payeeId: string | null;
  description: string | null;
};

/**
 * "Este cargocostaba X y ahora cuesta Y."
 *
 * `previousAverageMinor` is a mean and therefore fractional, like
 * `RecurringGroup.averageAmountMinor`; the renderers round it for display.
 * `ratio` is null only when the previous charges were all zero — there is no
 * percentage to quote against a base of nothing, and the page says so in words
 * instead of printing `Infinity%`.
 */
export type PriceChange = {
  previousAverageMinor: number;
  latestAmountMinor: number;
  deltaMinor: number;
  ratio: number | null;
};

export type RecurringGroup = {
  key: string;
  label: string;
  currency: string;
  categoryId: string | null;
  monthsSeen: number;
  lastDate: Date;
  averageAmountMinor: number;
  /**
   * The most recent charge, which is not the same as a share of the average.
   *
   * Needed by the 30-day projection: what a subscription is about to be charged
   * is its last charge, not the mean of a year that includes the price it used
   * to have.
   */
  latestAmountMinor: number;
  totalAmountMinor: number;
  transactionCount: number;
  /** The most recent price move, or null when the last charge is not up. */
  priceChange: PriceChange | null;
  /**
   * Typical days between charges, or null with fewer than three charges.
   *
   * Not a constant 30: the detection doesn't know that everything it finds is
   * monthly. A charge every 20 days and a quarterly premium both satisfy the
   * same "3 months, similar amounts" test, and a projection built on an assumed
   * 30 would put both in the wrong week. The median, rather than the mean,
   * because one missed charge or one double charge shouldn't move the estimate
   * of when the next one lands.
   *
   * Never below about 10 in practice: `MIN_MONTHS` counts distinct *calendar*
   * months, so anything faster than fortnightly never qualifies as recurring and
   * never reaches here. A weekly subscription is invisible to this detector —
   * pinned as a test in recurring.test.ts.
   */
  medianIntervalDays: number | null;
};

const MIN_MONTHS = 3;
// Same-merchant charges that vary too much aren't a subscription — they're
// just a frequent stop (groceries, restaurants). Subscriptions cluster
// tightly around one amount; this tolerance is generous enough to absorb FX
// drift on USD-denominated subscriptions billed in COP, without also
// catching genuinely variable spending.
const MAX_COEFFICIENT_OF_VARIATION = 0.35;

/**
 * How much the latest charge has to exceed what the subscription used to cost
 * before it counts as a price increase. 10% is the point where a subscription
 * is worth an email from the provider and a line on this page.
 */
const MIN_PRICE_INCREASE_RATIO = 0.1;

/**
 * Did the most recent charge go up on what came before it?
 *
 * This is the number that hurts most and is easiest to miss: a subscription
 * that went from 35.000 to 42.000 still averages out to "about 40.000" in the
 * monthly estimate, and the ledger shows a charge that looks like every other
 * charge. Nothing anywhere says the merchant raised the price.
 *
 * The comparison is against every earlier charge in the group, not against
 * `RecurringGroup.averageAmountMinor` — that mean includes the latest charge
 * itself, so a 20% rise over 4 months dilutes to about 5% and disappears. It
 * therefore reports the *most recent* move and says nothing about older ones:
 * a subscription that rose three times and then held steady for a year shows no
 * alert, which is the honest reading — nothing changed lately.
 *
 * Two floors, and the higher one has to be cleared. The ratio is what the user
 * reads, but on its own it treats a 3.000 → 3.300 plan exactly as loudly as a
 * 35.000 → 42.000 one. The deviation floor is the data's own noise band, so a
 * subscription that already drifts month to month does not raise an alert for a
 * move inside that drift. Being derived from the data, it needs no minimum in
 * pesos, which is what lets the same rule work for a USD plan billed in COP.
 */
export function detectPriceIncrease(
  latestAmountMinor: number,
  previousAmounts: number[]
): PriceChange | null {
  // One previous charge is a single point, not an average: against it, any
  // change is indistinguishable from the noise. detectRecurring's MIN_MONTHS
  // already guarantees two in the three-charge case; this guard is for a
  // direct caller that doesn't.
  if (previousAmounts.length < 2) return null;

  const previousMean =
    previousAmounts.reduce((s, a) => s + a, 0) / previousAmounts.length;
  const variance =
    previousAmounts.reduce((s, a) => s + (a - previousMean) ** 2, 0) /
    previousAmounts.length;
  const previousStdDev = Math.sqrt(variance);

  const deltaMinor = latestAmountMinor - previousMean;
  if (deltaMinor <= 0) return null;
  if (deltaMinor <= previousMean * MIN_PRICE_INCREASE_RATIO) return null;
  if (deltaMinor <= previousStdDev) return null;

  return {
    previousAverageMinor: previousMean,
    latestAmountMinor,
    deltaMinor,
    ratio: previousMean > 0 ? latestAmountMinor / previousMean : null,
  };
}

/**
 * Days between charges, taking the middle one.
 *
 * An odd number of gaps averages the two in the middle; an even one takes the
 * lower of the two, so a charge that lands a day early doesn't pull the estimate
 * later. Either way the answer is a real observed gap rather than a blend, which
 * matters because the result decides what day a subscription is expected to
 * charge on.
 */
function medianIntervalDays(chronological: RecurringCandidate[]): number | null {
  if (chronological.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < chronological.length; i++) {
    gaps.push(
      Math.round(
        (chronological[i].date.getTime() - chronological[i - 1].date.getTime()) / 86_400_000
      )
    );
  }
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 1 ? gaps[mid] : gaps[mid - 1];
}

/**
 * Detects recurring expenses (subscriptions, memberships, rent...) from the
 * existing transaction history — no new schema, purely a read-time pattern
 * over transactions already imported or entered by hand.
 *
 * Grouped by payee when set, otherwise by the raw description (lowercased) —
 * a transaction with neither is skipped, since there's nothing to group it
 * on. A group counts as recurring when it's shown up in at least
 * MIN_MONTHS distinct calendar months with a tight enough amount spread.
 */
export function detectRecurring(
  txs: RecurringCandidate[],
  payeeName: Map<string, string>
): RecurringGroup[] {
  const groups = new Map<string, RecurringCandidate[]>();
  for (const tx of txs) {
    if (tx.type !== "expense") continue;
    const desc = tx.description?.trim().toLowerCase();
    const key = tx.payeeId ? `payee:${tx.payeeId}` : desc ? `desc:${desc}` : null;
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  const result: RecurringGroup[] = [];
  for (const [key, groupTxs] of groups) {
    // LOCAL month, not the UTC one `toISOString()` would give. A Netflix charge
    // on the 31st at 8pm local is still August, and counting it as September
    // can make a group look like it spans more months than it does. Every other
    // month bucketing in the app goes through monthKey() for the same reason.
    const months = new Set(groupTxs.map((t) => monthKey(t.date)));
    if (months.size < MIN_MONTHS) continue;

    const amounts = groupTxs.map((t) => t.amountMinor);
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
    const coefficientOfVariation = mean === 0 ? 0 : Math.sqrt(variance) / mean;
    if (coefficientOfVariation > MAX_COEFFICIENT_OF_VARIATION) continue;

    const sorted = [...groupTxs].sort((a, b) => b.date.getTime() - a.date.getTime());
    const latest = sorted[0];

    const categoryCounts = new Map<string, number>();
    for (const t of groupTxs) {
      if (!t.categoryId) continue;
      categoryCounts.set(t.categoryId, (categoryCounts.get(t.categoryId) ?? 0) + 1);
    }
    let categoryId: string | null = null;
    let bestCount = 0;
    for (const [id, count] of categoryCounts) {
      if (count > bestCount) {
        categoryId = id;
        bestCount = count;
      }
    }

    const label = key.startsWith("payee:") ? (payeeName.get(key.slice(6)) ?? latest.description ?? key) : (latest.description ?? key.slice(5));

    result.push({
      key,
      label,
      currency: latest.currency,
      categoryId,
      monthsSeen: months.size,
      lastDate: latest.date,
      averageAmountMinor: mean,
      latestAmountMinor: latest.amountMinor,
      totalAmountMinor: amounts.reduce((s, a) => s + a, 0),
      transactionCount: groupTxs.length,
      // `sorted` is newest-first, so everything after the head is what the
      // subscription cost before its latest charge.
      priceChange: detectPriceIncrease(
        latest.amountMinor,
        sorted.slice(1).map((t) => t.amountMinor)
      ),
      medianIntervalDays: medianIntervalDays([...sorted].reverse()),
    });
  }

  return result.sort((a, b) => b.averageAmountMinor - a.averageAmountMinor);
}

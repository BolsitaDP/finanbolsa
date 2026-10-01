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

export type RecurringGroup = {
  key: string;
  label: string;
  currency: string;
  categoryId: string | null;
  monthsSeen: number;
  lastDate: Date;
  averageAmountMinor: number;
  totalAmountMinor: number;
  transactionCount: number;
};

const MIN_MONTHS = 3;
// Same-merchant charges that vary too much aren't a subscription — they're
// just a frequent stop (groceries, restaurants). Subscriptions cluster
// tightly around one amount; this tolerance is generous enough to absorb FX
// drift on USD-denominated subscriptions billed in COP, without also
// catching genuinely variable spending.
const MAX_COEFFICIENT_OF_VARIATION = 0.35;

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
      totalAmountMinor: amounts.reduce((s, a) => s + a, 0),
      transactionCount: groupTxs.length,
    });
  }

  return result.sort((a, b) => b.averageAmountMinor - a.averageAmountMinor);
}

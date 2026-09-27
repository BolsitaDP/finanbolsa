import type { accounts, transactions } from "@/db/schema";

/**
 * Minimal factories for the two row types the calculation helpers consume.
 *
 * Both helpers take plain arrays and never touch the database, which is what
 * makes them testable at all — the goal is to keep it that way. Every field
 * the helpers don't read still needs a value because these are the full drizzle
 * select types, so defaults live here rather than being repeated per test.
 */

type Account = typeof accounts.$inferSelect;
type Transaction = typeof transactions.$inferSelect;

export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Cuenta principal",
    type: "bank",
    currency: "COP",
    creditLimitMinor: null,
    status: "active",
    openedAt: null,
    notes: null,
    referenceDate: utc("2025-01-01"),
    referenceBalanceMinor: 0,
    ...overrides,
  };
}

let nextId = 1;

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: nextId++,
    date: utc("2025-01-15"),
    type: "expense",
    accountId: "acc-1",
    destinationAccountId: null,
    amountMinor: 0,
    currency: "COP",
    destinationAmountMinor: null,
    destinationCurrency: null,
    categoryId: null,
    payeeId: null,
    description: null,
    projectTrip: null,
    notes: null,
    importBatchId: null,
    createdAt: utc("2025-01-15"),
    updatedAt: utc("2025-01-15"),
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Midday UTC on purpose.
 *
 * `recurring.ts` buckets months with `toISOString()` (UTC) while `month.ts`
 * uses local `getFullYear`/`getMonth`. A 12:00Z timestamp lands on the same
 * calendar day in every timezone from UTC-12 to UTC+12, so these fixtures
 * can't drift into a neighbouring month depending on where the suite runs.
 */
function utc(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export { utc };

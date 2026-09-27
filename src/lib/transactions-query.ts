import { and, asc, desc, eq, isNull, like, or, sql, type SQL } from "drizzle-orm";

import { accounts, categories, payees, transactions } from "@/db/schema";

/**
 * Server-side filtering, sorting and pagination for the transactions table.
 *
 * This used to happen in the browser: the page loaded every non-deleted
 * transaction and TanStack filtered the array. That shipped the whole table on
 * every visit, and it grew linearly — unusable over a WAN link and expensive to
 * serialize on a Raspberry Pi.
 *
 * Keeping the logic here (pure, no I/O) also means the URL is the single
 * source of truth for what the table shows, so any view is shareable and a
 * reload lands on the same page.
 */

export const PAGE_SIZE = 50;

export const TRANSACTION_TYPES = ["expense", "income", "transfer"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Whitelist of sortable columns, mapped to real SQL.
 *
 * A string interpolated into ORDER BY can't be parameterised, so the only safe
 * way to accept a sort from the URL is to look the name up here and use the
 * resulting expression. Anything unrecognised falls back to date.
 */
export const TRANSACTION_SORTS = {
  date: (d: 1 | -1) => (d === -1 ? desc(transactions.date) : asc(transactions.date)),
  amountMinor: (d: 1 | -1) =>
    d === -1 ? desc(transactions.amountMinor) : asc(transactions.amountMinor),
  category: (d: 1 | -1) => (d === -1 ? desc(categories.name) : asc(categories.name)),
  payeeOrDescription: (d: 1 | -1) =>
    d === -1
      ? [desc(payees.name), desc(transactions.description)]
      : [asc(payees.name), asc(transactions.description)],
  accountLabel: (d: 1 | -1) => (d === -1 ? desc(accounts.name) : asc(accounts.name)),
} as const;

export type TransactionSort = keyof typeof TRANSACTION_SORTS;

export const DEFAULT_SORT: TransactionSort = "date";

export type TransactionFilters = {
  q: string;
  type: TransactionType | "all";
  account: string; // "all" or an account id
  sort: TransactionSort;
  dir: "asc" | "desc";
  page: number; // 1-based
};

export const DEFAULT_FILTERS: TransactionFilters = {
  q: "",
  type: "all",
  account: "all",
  sort: DEFAULT_SORT,
  dir: "desc",
  page: 1,
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Normalises whatever arrives in the URL into something the query builder can
 * trust. Every field is clamped rather than rejected, so a hand-edited or
 * stale link degrades to the default view instead of erroring.
 */
export function parseTransactionFilters(
  params: Record<string, string | string[] | undefined>
): TransactionFilters {
  const q = (first(params.q) ?? "").trim();
  const rawType = first(params.type);
  const rawSort = first(params.sort);
  const rawDir = first(params.dir);
  const rawPage = Number(first(params.page));

  const type = TRANSACTION_TYPES.find((t) => t === rawType);
  const sort = (Object.keys(TRANSACTION_SORTS) as string[]).find((s) => s === rawSort);

  return {
    q,
    type: type ?? "all",
    account: first(params.account) ?? "all",
    sort: (sort as TransactionSort | undefined) ?? DEFAULT_SORT,
    // Newest first is what people expect from a transaction list, so `desc` is
    // the default rather than TanStack's ascending-first convention.
    dir: rawDir === "asc" ? "asc" : "desc",
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

/**
 * Escapes LIKE wildcards in user input.
 *
 * Without this, searching for "100%" matches everything — the user's literal
 * percent becomes a wildcard. `ESCAPE '\'` then makes the backslash literal
 * too. This is a correctness fix, not just a tidy-up.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export type TransactionQuery = {
  where: SQL | undefined;
  orderBy: SQL[];
  limit: number;
  offset: number;
  page: number;
};

/**
 * Builds the WHERE/ORDER BY/LIMIT for one page of transactions.
 *
 * `accounts` is both the table being filtered and the join for the account
 * label, so the account filter and the label join share one alias.
 */
export function buildTransactionQuery(filters: TransactionFilters): TransactionQuery {
  const conditions: (SQL | undefined)[] = [isNull(transactions.deletedAt)];

  if (filters.type !== "all") {
    conditions.push(eq(transactions.type, filters.type));
  }
  if (filters.account !== "all") {
    conditions.push(eq(transactions.accountId, filters.account));
  }

  if (filters.q) {
    // Mirrors what the client-side filter used to match: the resolved labels,
    // not just the raw columns — so "Rappi" still finds a row whose only
    // identifying text is the payee name.
    const pattern = `%${escapeLikePattern(filters.q)}%`;
    const search = or(
      like(transactions.description, pattern),
      like(payees.name, pattern),
      like(categories.name, pattern),
      like(accounts.name, pattern)
    );
    conditions.push(sql`(${search})`);
  }

  const direction = filters.dir === "asc" ? 1 : -1;
  const orderBy = TRANSACTION_SORTS[filters.sort](direction as 1 | -1);

  return {
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: Array.isArray(orderBy) ? orderBy : [orderBy],
    limit: PAGE_SIZE,
    offset: (filters.page - 1) * PAGE_SIZE,
    page: filters.page,
  };
}

/** Serialises filters back to a query string, omitting defaults to keep URLs short. */
export function filtersToQueryString(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.account !== "all") params.set("account", filters.account);
  if (filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  if (filters.dir !== "desc") params.set("dir", filters.dir);
  if (filters.page > 1) params.set("page", String(filters.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

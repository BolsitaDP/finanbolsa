import { and, asc, desc, eq, isNull, like, or, sql, type SQL } from "drizzle-orm";

import { accounts, categories, payees, transactions } from "@/db/schema";
import { monthInRange } from "@/lib/month-sql";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/enums";

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

/**
 * Filas por página, por defecto.
 *
 * 25, no 50. La decisión se tomó con el dato de dónde se usa: la app vive en una
 * Raspberry Pi y se abre **desde el celular**, por wifi. Con el markup por fila ya
 * reducido (§5.1) cada fila sigue pesando ~5 KB, así que 50 filas son ~250 KB de
 * tabla que el celular tiene que bajar y parsear para mostrar una lista que nadie
 * va a recorrer entera — la paginación está debajo.
 *
 * El selector sigue ofreciendo 50 y 100, así que en un escritorio grande se
 * cambia en un clic. Y como el valor vive en la URL, un enlace a
 * `/transacciones?pageSize=100` lo abre a 100 sin importar el defecto.
 */
export const PAGE_SIZE = 25;

/**
 * Page sizes offered for the server-driven table.
 *
 * The "Filas por página" picker used to write to TanStack's pagination state,
 * which the server-mode table overwrites from props on every render — so the
 * choice looked like it saved and did nothing. The size is part of the URL
 * instead, like every other thing about what the table shows.
 */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

// TRANSACTION_TYPES is imported, not redeclared: this file used to define its
// own copy, which meant two sources of truth for the same enum and a silent
// failure waiting for whoever added a type to only one of them.

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

/** A month filter is only accepted in the exact 'YYYY-MM' shape monthKey() produces. */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const DEFAULT_SORT: TransactionSort = "date";

export type TransactionFilters = {
  q: string;
  type: TransactionType | "all";
  account: string; // "all" or an account id
  /** "all", "none" for uncategorised, or a category id. */
  category: string;
  /**
   * "all" or a payee id.
   *
   * Separate from `q` on purpose. The merchant ranking shows what a merchant
   * cost, and `q` would answer that with every row whose text happens to contain
   * the merchant's name — a different, larger set that doesn't add up to the
   * number next to it. Principle 3 of ROADMAP: a total you can't audit is a
   * total you can't trust.
   */
  payee: string;
  /**
   * 'YYYY-MM' to narrow to one calendar month, or "all".
   *
   * This exists so every total in the app can be audited: a budget envelope
   * showing "$412.000" links here, and the list that comes back has to be the
   * rows that made the number up. Without the month, a category total would
   * open onto its whole history and the arithmetic would not be checkable.
   */
  month: string;
  sort: TransactionSort;
  dir: "asc" | "desc";
  page: number; // 1-based
  pageSize: number;
};

export const DEFAULT_FILTERS: TransactionFilters = {
  q: "",
  type: "all",
  account: "all",
  category: "all",
  payee: "all",
  month: "all",
  sort: DEFAULT_SORT,
  dir: "desc",
  page: 1,
  pageSize: PAGE_SIZE,
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
  const rawCategory = first(params.category);
  const rawMonth = first(params.month);
  const rawSort = first(params.sort);
  const rawDir = first(params.dir);
  const rawPage = Number(first(params.page));
  const rawPageSize = Number(first(params.pageSize));

  const type = TRANSACTION_TYPES.find((t) => t === rawType);
  const sort = (Object.keys(TRANSACTION_SORTS) as string[]).find((s) => s === rawSort);

  // `||` and not `??` for the id filters, matching what `category` already did:
  // a bare `?payee=` arrives as an empty string, which is neither a valid id nor
  // the "all" sentinel. Left as "", it would reach the WHERE clause and match no
  // row at all — a hand-edited or truncated link would silently show an empty
  // table instead of the unfiltered list.
  const rawAccount = first(params.account);
  const rawPayee = first(params.payee);

  return {
    q,
    type: type ?? "all",
    account: rawAccount || "all",
    category: rawCategory && rawCategory !== "" ? rawCategory : "all",
    payee: rawPayee || "all",
    month: MONTH_PATTERN.test(rawMonth ?? "") ? rawMonth! : "all",
    sort: (sort as TransactionSort | undefined) ?? DEFAULT_SORT,
    // Newest first is what people expect from a transaction list, so `desc` is
    // the default rather than TanStack's ascending-first convention.
    dir: rawDir === "asc" ? "asc" : "desc",
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawPageSize)
      ? rawPageSize
      : PAGE_SIZE,
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
  if (filters.payee !== "all") {
    conditions.push(eq(transactions.payeeId, filters.payee));
  }
  if (filters.category === "none") {
    // "Sin categoría" is the weekly chore: reviewing what arrived uncategorised
    // and fixing it. There was no way to list those rows at all — the filter
    // simply did not exist, so the only option was scanning for the em-dashes.
    conditions.push(isNull(transactions.categoryId));
  } else if (filters.category !== "all") {
    conditions.push(eq(transactions.categoryId, filters.category));
  }

  if (filters.month !== "all") {
    // `monthInRange`, not `eq(transactionMonth, ...)`: the month a total was
    // counted in has to be the same month this filter selects, or "auditar este
    // número" would show a different set of rows than the number came from — and
    // both agree because both bucket in local time.
    //
    // A range rather than a `strftime` equality because the equality cannot use
    // `transactions_date_idx`: SQLite cannot invert the function, so every
    // "auditar este total" click was reading the whole table. The bounds come from
    // `monthRange()`, which is the same definition of month as `monthKey()`.
    conditions.push(monthInRange(filters.month));
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
    limit: filters.pageSize,
    offset: (filters.page - 1) * filters.pageSize,
    page: filters.page,
  };
}

/** Serialises filters back to a query string, omitting defaults to keep URLs short. */export function filtersToQueryString(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.account !== "all") params.set("account", filters.account);
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.payee !== "all") params.set("payee", filters.payee);
  if (filters.month !== "all") params.set("month", filters.month);
  if (filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  if (filters.dir !== "desc") params.set("dir", filters.dir);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== PAGE_SIZE) params.set("pageSize", String(filters.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
/**
 * The link that lets someone check where a total came from.
 *
 * Every sum the app shows is now computed in SQL (see aggregates.ts), which
 * is fast but opaque: "$412.000" is no longer something you can read off a
 * loop. This points at the transaction list filtered to exactly the rows that
 * produced it, which is the whole point of ROADMAP §3.4 — a number you cannot
 * audit is a number you cannot trust.
 *
 * Built here rather than inline so every total links the same way, and so the
 * month is never dropped by accident: a category total opened without its
 * month shows the category's whole history, which does not add up to anything.
 */
export function auditLink(filters: {
  category?: string;
  month?: string;
  type?: TransactionType;
  account?: string;
  payee?: string;
  q?: string;
}): string {
  const merged: TransactionFilters = {
    ...DEFAULT_FILTERS,
    q: filters.q ?? "",
    type: filters.type ?? "all",
    account: filters.account ?? "all",
    category: filters.category ?? "all",
    payee: filters.payee ?? "all",
    month: filters.month ?? "all",
  };
  return `/transacciones${filtersToQueryString(merged)}`;
}

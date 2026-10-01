import { describe, expect, it } from "vitest";

import {
  buildTransactionQuery,
  PAGE_SIZE_OPTIONS,
  escapeLikePattern,
  filtersToQueryString,
  parseTransactionFilters,
  DEFAULT_FILTERS,
  PAGE_SIZE,
  TRANSACTION_SORTS,
  type TransactionFilters,
} from "@/lib/transactions-query";

/**
 * This module is the trust boundary between the URL and SQL. It is worth
 * testing directly because the failure modes are quiet: a bad sort becomes a
 * 500, an unescaped wildcard silently returns the wrong rows, and a bad page
 * number shows an empty table with no explanation.
 */

const filters = (over: Partial<TransactionFilters> = {}): TransactionFilters => ({
  ...DEFAULT_FILTERS,
  ...over,
});

describe("parseTransactionFilters", () => {
  it("falls back to defaults for an empty query string", () => {
    expect(parseTransactionFilters({})).toEqual(DEFAULT_FILTERS);
  });

  it("reads every supported filter", () => {
    expect(
      parseTransactionFilters({
        q: "rappi",
        type: "expense",
        account: "acc-2",
        category: "cat-3",
        payee: "payee-4",
        month: "2026-08",
        sort: "amountMinor",
        dir: "asc",
        page: "3",
        pageSize: "100",
      })
    ).toEqual({
      q: "rappi",
      type: "expense",
      account: "acc-2",
      category: "cat-3",
      payee: "payee-4",
      month: "2026-08",
      sort: "amountMinor",
      dir: "asc",
      page: 3,
      pageSize: 100,
    });
  });

  it("defaults the payee filter to all, including when empty", () => {
    expect(parseTransactionFilters({}).payee).toBe("all");
    expect(parseTransactionFilters({ payee: "" }).payee).toBe("all");
  });

  it("defaults an empty account filter to all, not to a value that matches nothing", () => {
    // El mismo hueco que el de `payee`, encontrado al arreglar el otro: un
    // `?account=` a medio escribir deja la lista vacía en vez de sin filtrar.
    expect(parseTransactionFilters({ account: "" }).account).toBe("all");
  });

  it("round-trips the payee filter through the query string", () => {
    // El ranking de comercios enlaza a este filtro, así que perderlo al salir
    // abriría el total sobre una lista que no le suma.
    const parsed = parseTransactionFilters({ payee: "payee-rappi", month: "2026-08" });
    expect(filtersToQueryString(parsed)).toBe("?payee=payee-rappi&month=2026-08");
  });

  it("defaults the month filter to all", () => {
    expect(parseTransactionFilters({}).month).toBe("all");
    expect(parseTransactionFilters({ month: "" }).month).toBe("all");
    expect(parseTransactionFilters({ month: "all" }).month).toBe("all");
  });

  it("rejects a month that is not the exact YYYY-MM shape", () => {
    // These values reach the SQL as a strftime comparison, so anything loose
    // enough to match no month would silently show an empty list — which reads
    // as "I spent nothing" rather than as a broken link. A hand-edited or stale
    // URL has to degrade to "all" instead.
    for (const month of ["2026-13", "2026-00", "26-08", "2026-8", "agosto", "2026-08-01", "../2026-08"]) {
      expect(parseTransactionFilters({ month }).month, month).toBe("all");
    }
  });

  it("round-trips the month filter through the query string", () => {
    // The audit links are built from these, so losing the month on the way out
    // would open a total onto the category's whole history.
    const filters = parseTransactionFilters({ category: "cat-3", month: "2026-08" });
    expect(filtersToQueryString(filters)).toBe("?category=cat-3&month=2026-08");
  });

  it("omits the month from the query string when it is the default", () => {
    expect(filtersToQueryString(parseTransactionFilters({ category: "cat-3" }))).toBe(
      "?category=cat-3"
    );
  });

  it("defaults the category filter to all, including when empty", () => {
    expect(parseTransactionFilters({}).category).toBe("all");
    expect(parseTransactionFilters({ category: "" }).category).toBe("all");
  });

  it("accepts the uncategorised shortcut", () => {
    // "none" is the weekly chore: clear whatever arrived without a category.
    expect(parseTransactionFilters({ category: "none" }).category).toBe("none");
  });

  it("clamps page size to the offered options", () => {
    // The page size arrives from the URL, so an arbitrary value has to be
    // rejected rather than passed to LIMIT.
    expect(parseTransactionFilters({ pageSize: "1000" }).pageSize).toBe(PAGE_SIZE);
    expect(parseTransactionFilters({ pageSize: "7" }).pageSize).toBe(PAGE_SIZE);
    expect(parseTransactionFilters({ pageSize: "-50" }).pageSize).toBe(PAGE_SIZE);
    expect(parseTransactionFilters({ pageSize: "abc" }).pageSize).toBe(PAGE_SIZE);
  });

  it("accepts every offered page size", () => {
    for (const size of PAGE_SIZE_OPTIONS) {
      expect(parseTransactionFilters({ pageSize: String(size) }).pageSize).toBe(size);
    }
  });

  it("takes the first value when a param repeats", () => {
    // Hand-edited and truncated URLs can produce arrays; without this the
    // lookup would be `undefined` and silently ignored.
    expect(parseTransactionFilters({ q: ["rappi", "netflix"] }).q).toBe("rappi");
  });

  it("rejects an unknown transaction type", () => {
    expect(parseTransactionFilters({ type: "drop-table" }).type).toBe("all");
  });

  it("rejects an unknown sort column instead of passing it through", () => {
    // The important case: sort becomes a SQL fragment, so an unrecognised
    // value must never reach the query builder.
    const parsed = parseTransactionFilters({ sort: "id; DROP TABLE transactions--" });
    expect(parsed.sort).toBe("date");
    expect(Object.keys(TRANSACTION_SORTS)).toContain(parsed.sort);
  });

  it("defaults dir to desc, not asc", () => {
    expect(parseTransactionFilters({}).dir).toBe("desc");
    expect(parseTransactionFilters({ dir: "sideways" }).dir).toBe("desc");
  });

  it("clamps a nonsensical page to 1", () => {
    for (const page of ["0", "-5", "abc", "1.5", ""]) {
      expect(parseTransactionFilters({ page }).page).toBe(1);
    }
  });

  it("trims the search term", () => {
    expect(parseTransactionFilters({ q: "  rappi  " }).q).toBe("rappi");
  });
});

describe("escapeLikePattern", () => {
  it("leaves ordinary text alone", () => {
    expect(escapeLikePattern("rappi")).toBe("rappi");
  });

  it("escapes the percent wildcard", () => {
    // Unescaped, "50%" would match "500", "5%", and everything else.
    expect(escapeLikePattern("50%")).toBe("50\\%");
  });

  it("escapes the underscore wildcard", () => {
    expect(escapeLikePattern("rappi_colo")).toBe("rappi\\_colo");
  });

  it("escapes the escape character itself", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });
});

describe("buildTransactionQuery", () => {
  it("always excludes soft-deleted rows", () => {
    // Even with no filters at all, a deleted row must never reach the table.
    const q = buildTransactionQuery(filters());
    expect(q.where).toBeDefined();
    expect(q.orderBy).toHaveLength(1);
  });

  it("pages with the configured page size", () => {
    const q = buildTransactionQuery(filters({ page: 4 }));
    expect(q.limit).toBe(PAGE_SIZE);
    expect(q.offset).toBe(3 * PAGE_SIZE);
  });

  it("honours a non-default page size in both limit and offset", () => {
    const q = buildTransactionQuery(filters({ page: 3, pageSize: 25 }));
    expect(q.limit).toBe(25);
    expect(q.offset).toBe(50);
  });

  it("starts at offset 0 for the first page", () => {
    expect(buildTransactionQuery(filters({ page: 1 })).offset).toBe(0);
  });

  it("builds one ORDER BY term for a single-column sort", () => {
    expect(buildTransactionQuery(filters({ sort: "date" })).orderBy).toHaveLength(1);
  });

  it("builds a tiebreaker pair for the payee/description sort", () => {
    // Two transactions can share a payee, so the secondary term keeps paging
    // stable instead of shuffling rows between pages.
    expect(buildTransactionQuery(filters({ sort: "payeeOrDescription" })).orderBy).toHaveLength(2);
  });

  it("supports every whitelisted sort without throwing", () => {
    for (const sort of Object.keys(TRANSACTION_SORTS) as (keyof typeof TRANSACTION_SORTS)[]) {
      for (const dir of ["asc", "desc"] as const) {
        const q = buildTransactionQuery(filters({ sort, dir }));
        expect(q.orderBy.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("filtersToQueryString", () => {
  it("omits defaults so the common case is a clean URL", () => {
    expect(filtersToQueryString(filters())).toBe("");
  });

  it("round-trips a non-default view", () => {
    const original = filters({
      q: "rappi",
      type: "expense",
      account: "acc-2",
      category: "none",
      payee: "payee-rappi",
      sort: "amountMinor",
      dir: "asc",
      page: 3,
      pageSize: 100,
    });
    const qs = filtersToQueryString(original);
    expect(parseTransactionFilters(Object.fromEntries(new URLSearchParams(qs)))).toEqual(original);
  });

  it("escapes search terms containing URL-significant characters", () => {
    const qs = filtersToQueryString(filters({ q: "a&b=c d" }));
    expect(parseTransactionFilters(Object.fromEntries(new URLSearchParams(qs))).q).toBe("a&b=c d");
  });
});

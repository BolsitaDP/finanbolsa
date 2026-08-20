import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { RuleCondition, RuleAction } from "@/lib/rules-types";

// --- accounts -------------------------------------------------------------
// type: bank | wallet | credit_card | cash | investment | other
// currency: COP | USD | EUR | GBP | CHF
// status: active | archived | closed
// *_minor fields: named after the source spreadsheet, but the source data
// carries fractional values (e.g. 1822990.99 COP), not integer cents — stored
// as `real` to match, not `integer`.
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  currency: text("currency").notNull(),
  creditLimitMinor: real("credit_limit_minor"),
  status: text("status").notNull().default("active"),
  openedAt: integer("opened_at", { mode: "timestamp" }),
  notes: text("notes"),
  referenceDate: integer("reference_date", { mode: "timestamp" }).notNull(),
  referenceBalanceMinor: real("reference_balance_minor").notNull().default(0),
});

// --- categories -------------------------------------------------------------
// kind: expense | income
// status: active | archived
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentCategoryId: text("parent_category_id"),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
});

// --- payees -----------------------------------------------------------
// Normalized "who you paid / who paid you", separate from the free-text
// description/notes on a transaction. Backs the rules engine and cleaner
// reporting than free-text descriptions allow.
export const payees = sqliteTable("payees", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  defaultCategoryId: text("default_category_id").references(() => categories.id),
  notes: text("notes"),
});

// --- transactions -----------------------------------------------------------
// type: expense | income | transfer
export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: integer("date", { mode: "timestamp" }).notNull(),
  type: text("type").notNull(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  destinationAccountId: text("destination_account_id").references(() => accounts.id),
  amountMinor: real("amount_minor").notNull(),
  currency: text("currency").notNull(),
  destinationAmountMinor: real("destination_amount_minor"),
  destinationCurrency: text("destination_currency"),
  categoryId: text("category_id").references(() => categories.id),
  payeeId: text("payee_id").references(() => payees.id),
  description: text("description"),
  projectTrip: text("project_trip"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// --- transaction splits -----------------------------------------------------------
// Optional breakdown of one expense transaction into specific sub-expenses —
// built for cash withdrawals ("retiro" imports/records as one lump expense so
// the account balance stays accurate) where you later remember what part of
// that cash actually went to. A split's amountMinor is informational only:
// it never touches account balances (only the parent transaction's amount
// does, since that's the real money movement) — it exists purely to let
// stats/budget totals attribute part of the parent's spend to a more
// specific category than the parent itself carries. Splits don't have to sum
// to the parent's amount; whatever isn't split still counts under the
// parent's own category.
export const transactionSplits = sqliteTable("transaction_splits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  amountMinor: real("amount_minor").notNull(),
  categoryId: text("category_id").references(() => categories.id),
  payeeId: text("payee_id").references(() => payees.id),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// --- rules -----------------------------------------------------------
// Auto-categorization: conditions combine via matchType ("all" = AND, "any"
// = OR); a matching rule's actions are applied to the transaction. Rules run
// in sortOrder, later matching rules override earlier ones.
export const rules = sqliteTable("rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  matchType: text("match_type").notNull().default("all"),
  conditions: text("conditions", { mode: "json" }).$type<RuleCondition[]>().notNull(),
  actions: text("actions", { mode: "json" }).$type<RuleAction[]>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// --- budgets -----------------------------------------------------------
// Envelope budgeting: one row per (category, month). "month" is 'YYYY-MM'.
// Spent/rollover/available are computed at query time, not stored.
export const budgets = sqliteTable(
  "budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    month: text("month").notNull(),
    budgetedMinor: real("budgeted_minor").notNull().default(0),
  },
  (t) => [uniqueIndex("budgets_category_month_idx").on(t.categoryId, t.month)]
);

// --- settings -----------------------------------------------------------
// Single-row table: app-wide settings. Fixed lookup catalogs (account types,
// currencies, transaction types, statuses) live as TS enums in src/lib/enums.ts
// instead of DB rows, since they're not user-editable.
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().default("default"),
  schemaVersion: text("schema_version").notNull().default("2.0"),
  baseCurrency: text("base_currency").notNull().default("COP"),
  startDate: integer("start_date", { mode: "timestamp" }).notNull(),
  owner: text("owner"),
  notes: text("notes"),
});

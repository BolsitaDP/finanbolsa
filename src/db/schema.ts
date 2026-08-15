import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

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

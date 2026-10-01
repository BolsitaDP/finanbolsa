export const ACCOUNT_TYPES = ["bank", "wallet", "credit_card", "cash", "investment", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CURRENCIES = ["COP", "USD", "EUR", "GBP", "CHF"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ACCOUNT_STATUSES = ["active", "archived", "closed"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const TRANSACTION_TYPES = ["expense", "income", "transfer"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CATEGORY_STATUSES = ["active", "archived"] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

/**
 * Spanish labels for the stored enum values.
 *
 * Every value in the database is English — `credit_card`, `archived`,
 * `expense`. Tables and bulk-edit pickers used to render them raw, so a
 * Spanish UI showed "credit card" and "active" next to "Rappi" and
 * "Suscripciones". Keeping the database in English and translating only at
 * the edge means one place to change, and no migration if a label is wrong.
 */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Banco",
  wallet: "Billetera",
  credit_card: "Tarjeta de crédito",
  cash: "Efectivo",
  investment: "Inversión",
  other: "Otro",
};

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Activa",
  archived: "Archivada",
  closed: "Cerrada",
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
};

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  expense: "Gasto",
  income: "Ingreso",
};

export const CATEGORY_STATUS_LABELS: Record<CategoryStatus, string> = {
  active: "Activa",
  archived: "Archivada",
};

/**
 * The `{ valor: etiqueta }` shape every select and picker in the app wants.
 *
 * This existed inline nine times as `Object.fromEntries(TYPES.map((t) => [t,
 * LABELS[t]]))`, and four of those nine had drifted into showing the raw value
 * instead — `t.replace("_", " ")` for account types, and plain `t` for the
 * category and account status pickers. That is how a Spanish form ended up
 * offering "credit card" and "active" as choices. One helper removes the
 * repetition and makes it impossible to translate one picker and forget the
 * next.
 */
export function labelItems<K extends string>(values: readonly K[], labels: Record<K, string>) {
  return Object.fromEntries(values.map((value) => [value, labels[value]]));
}

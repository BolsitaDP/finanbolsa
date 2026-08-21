export const ACCOUNT_TYPES = ["bank", "wallet", "credit_card", "cash", "investment", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CURRENCIES = ["COP", "USD", "EUR", "GBP", "CHF"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ACCOUNT_STATUSES = ["active", "archived", "closed"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const TRANSACTION_TYPES = ["expense", "income", "transfer"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
};

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CATEGORY_STATUSES = ["active", "archived"] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

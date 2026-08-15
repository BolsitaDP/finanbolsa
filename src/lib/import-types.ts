export type ParsedTransaction = {
  date: string; // ISO
  description: string;
  amountMinor: number; // signed: negative = expense, positive = income
};

export type ParsedGroup = {
  key: string;
  merchantLabel: string;
  count: number;
  totalAmountMinor: number; // signed
  sampleDescription: string;
  type: "expense" | "income";
  transactions: ParsedTransaction[];
  suggestedPayeeId: string | null;
  suggestedCategoryId: string | null;
  duplicateCount: number;
};

export type ImportGroupInput = {
  merchantLabel: string;
  type: "expense" | "income" | "transfer";
  payeeId: string | null;
  newPayeeName: string | null;
  categoryId: string | null;
  destinationAccountId: string | null;
  skip: boolean;
  createRule: boolean;
  transactions: ParsedTransaction[];
};

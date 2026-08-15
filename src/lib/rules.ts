import type { transactions } from "@/db/schema";
import type { RuleAction, RuleCondition } from "./rules-types";

type Transaction = typeof transactions.$inferSelect;

function fieldValue(tx: Transaction, field: RuleCondition["field"]): string {
  switch (field) {
    case "description":
      return tx.description ?? "";
    case "payeeId":
      return tx.payeeId ?? "";
    case "accountId":
      return tx.accountId;
    case "amountMinor":
      return String(tx.amountMinor);
  }
}

function conditionMatches(tx: Transaction, condition: RuleCondition): boolean {
  const value = fieldValue(tx, condition.field);
  if (condition.op === "equals") {
    return value.toLowerCase() === condition.value.toLowerCase();
  }
  return value.toLowerCase().includes(condition.value.toLowerCase());
}

export function ruleMatches(tx: Transaction, conditions: RuleCondition[]): boolean {
  if (conditions.length === 0) return false;
  return conditions.every((c) => conditionMatches(tx, c));
}

/** Applies actions to a shallow copy of the transaction's mutable fields. */
export function applyActions(
  patch: { categoryId?: string | null; payeeId?: string | null },
  actions: RuleAction[]
) {
  for (const action of actions) {
    if (action.field === "categoryId") patch.categoryId = action.value;
    if (action.field === "payeeId") patch.payeeId = action.value;
  }
  return patch;
}

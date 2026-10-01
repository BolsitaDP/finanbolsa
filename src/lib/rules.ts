import type { RuleAction, RuleCondition, RuleMatchType } from "./rules-types";

// The rule engine only ever reads these four fields, so anything matching
// this shape can be evaluated — a full transaction row, or a lightweight
// stand-in built from a not-yet-imported statement row.
export type RuleMatchable = {
  description: string | null;
  payeeId: string | null;
  accountId: string;
  amountMinor: number;
};

/**
 * Operators where an empty value would mean "matches everything".
 *
 * Split out because it is the one place `conditionMatches` overrides normal
 * string semantics, and the reason has to stay visible: `"abc".includes("")` is
 * `true` in JavaScript, and a saved rule with an empty box in it should not
 * become a rule that catches the whole ledger.
 */
const SUBSTRING_OPS: ReadonlySet<RuleCondition["op"]> = new Set([
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
]);

function fieldValue(tx: RuleMatchable, field: RuleCondition["field"]): string {
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

function conditionMatches(tx: RuleMatchable, condition: RuleCondition): boolean {
  if (condition.field === "amountMinor") {
    const txNum = tx.amountMinor;
    const condNum = Number(condition.value);
    if (Number.isNaN(condNum)) return false;
    switch (condition.op) {
      case "equals":
        return txNum === condNum;
      case "not_equals":
        return txNum !== condNum;
      case "greater_than":
        return txNum > condNum;
      case "greater_or_equal":
        return txNum >= condNum;
      case "less_than":
        return txNum < condNum;
      case "less_or_equal":
        return txNum <= condNum;
      default:
        // Text-only ops (contains, starts_with, ...) don't apply to a number.
        return false;
    }
  }

  const value = fieldValue(tx, condition.field).toLowerCase();
  const target = condition.value.toLowerCase();

  // An empty value on a substring operator is a catch-all, not a match: in
  // JavaScript every string contains "", so a half-filled condition left in a
  // saved rule would file every transaction into one category. `equals` and
  // `not_equals` are exempt, because "the description is empty" is a real
  // question — that is how a rule targets uncategorised or payee-less rows.
  if (target.trim() === "" && SUBSTRING_OPS.has(condition.op)) return false;

  switch (condition.op) {
    case "contains":
      return value.includes(target);
    case "not_contains":
      return !value.includes(target);
    case "starts_with":
      return value.startsWith(target);
    case "ends_with":
      return value.endsWith(target);
    case "equals":
      return value === target;
    case "not_equals":
      return value !== target;
    default:
      // Numeric-only ops don't apply to text fields.
      return false;
  }
}

export function ruleMatches(
  tx: RuleMatchable,
  conditions: RuleCondition[],
  matchType: RuleMatchType = "all"
): boolean {
  if (conditions.length === 0) return false;
  return matchType === "any"
    ? conditions.some((c) => conditionMatches(tx, c))
    : conditions.every((c) => conditionMatches(tx, c));
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

/**
 * Removes any condition/action referencing one of `deletedIds` on `field`.
 * Rule conditions and actions store raw ids in a JSON blob, not a real
 * foreign key, so deleting a payee/category/account doesn't automatically
 * clean up rules that reference it — call this from that entity's delete
 * action to keep rules in sync (a stale action id would otherwise throw a
 * raw FK error the next time rules are applied to a transaction).
 */
export function stripStaleRuleReferences(
  rule: { conditions: RuleCondition[]; actions: RuleAction[] },
  field: RuleCondition["field"] | RuleAction["field"],
  deletedIds: Set<string>
): { conditions: RuleCondition[]; actions: RuleAction[]; changed: boolean } {
  const conditions = rule.conditions.filter((c) => !(c.field === field && deletedIds.has(c.value)));
  const actions = rule.actions.filter((a) => !(a.field === field && deletedIds.has(a.value)));
  const changed = conditions.length !== rule.conditions.length || actions.length !== rule.actions.length;
  return { conditions, actions, changed };
}

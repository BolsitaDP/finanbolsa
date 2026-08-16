export const RULE_FIELDS = ["description", "payeeId", "accountId", "amountMinor"] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export const RULE_OPS = [
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "equals",
  "not_equals",
  "greater_than",
  "greater_or_equal",
  "less_than",
  "less_or_equal",
] as const;
export type RuleOp = (typeof RULE_OPS)[number];

// Which ops make sense per field, for the rule builder UI: payeeId/accountId
// are exact IDs picked from a dropdown (substring ops don't mean anything),
// and amountMinor is compared numerically (text ops don't apply there).
export const OPS_BY_FIELD: Record<RuleField, readonly RuleOp[]> = {
  description: ["contains", "not_contains", "starts_with", "ends_with", "equals", "not_equals"],
  payeeId: ["equals", "not_equals"],
  accountId: ["equals", "not_equals"],
  amountMinor: ["equals", "not_equals", "greater_than", "greater_or_equal", "less_than", "less_or_equal"],
};

export const RULE_MATCH_TYPES = ["all", "any"] as const;
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number];

export type RuleCondition = {
  field: RuleField;
  op: RuleOp;
  value: string;
};

export type RuleActionField = "categoryId" | "payeeId";

export type RuleAction = {
  field: RuleActionField;
  value: string;
};

export const RULE_FIELDS = ["description", "payeeId", "accountId", "amountMinor"] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export const RULE_OPS = ["contains", "equals"] as const;
export type RuleOp = (typeof RULE_OPS)[number];

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

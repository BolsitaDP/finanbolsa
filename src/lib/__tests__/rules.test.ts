import { describe, expect, it } from "vitest";

import { applyActions, ruleMatches, stripStaleRuleReferences, type RuleMatchable } from "@/lib/rules";
import type { RuleAction, RuleCondition } from "@/lib/rules-types";

/**
 * The auto-categorisation engine.
 *
 * A wrong rule does not throw: it quietly files a transaction under the wrong
 * category, and every total that category feeds is then wrong in a way that
 * looks like real spending. With dozens of rules live and precedence decided at
 * read time, the only way to know which one won is to have asked.
 *
 * The case worth defending hardest is the last group: a rule whose condition
 * references a deleted category. It can never match again, and if it is the only
 * condition, it must not silently swallow the transaction.
 */

const tx = (overrides: Partial<RuleMatchable> = {}): RuleMatchable => ({
  description: "COMPRA EN EXITO SA",
  payeeId: null,
  accountId: "acc-1",
  amountMinor: 50_000,
  ...overrides,
});

const cond = (overrides: Partial<RuleCondition> = {}): RuleCondition => ({
  field: "description",
  op: "contains",
  value: "exito",
  ...overrides,
});

const action = (overrides: Partial<RuleAction> = {}): RuleAction => ({
  field: "categoryId",
  value: "cat-mercado",
  ...overrides,
});

describe("ruleMatches", () => {
  it("matches text regardless of case, in either direction", () => {
    // Bank descriptions are inconsistent about case; a rule typed in lowercase
    // has to match "COMPRA EN EXITO SA".
    expect(ruleMatches(tx(), [cond({ value: "exito" })])).toBe(true);
    expect(ruleMatches(tx({ description: "compra en exito sa" }), [cond({ value: "EXITO" })])).toBe(true);
  });

  it("requires every condition with matchType 'all'", () => {
    const conditions = [cond(), cond({ field: "amountMinor", op: "greater_than", value: "1000" })];

    expect(ruleMatches(tx(), conditions, "all")).toBe(true);
    expect(ruleMatches(tx({ amountMinor: 500 }), conditions, "all")).toBe(false);
  });

  it("requires only one condition with matchType 'any'", () => {
    const conditions = [cond(), cond({ value: "inexistente" })];

    expect(ruleMatches(tx(), conditions, "any")).toBe(true);
  });

  it("never matches a rule with no conditions", () => {
    // An empty rule would otherwise be a catch-all: `every([])` is true, so a
    // rule whose conditions were all deleted would suddenly file every
    // transaction. The zero-condition rule is not a match.
    expect(ruleMatches(tx(), [])).toBe(false);
    expect(ruleMatches(tx(), [], "any")).toBe(false);
  });

  it("treats a null field as an empty string rather than failing to match", () => {
    // `not_contains` on an absent description should be true; the "Sin categoría"
    // and uncategorised flows depend on null not meaning "unknown".
    expect(ruleMatches(tx({ description: null }), [cond({ op: "not_contains", value: "exito" })])).toBe(
      true
    );
    expect(ruleMatches(tx({ description: null }), [cond()])).toBe(false);
  });

  it("compares amounts numerically, not as text", () => {
    // "100" < "9" as strings. A rule written as greater_than 100 must not match
    // an amount of 9.
    expect(ruleMatches(tx({ amountMinor: 9 }), [cond({ field: "amountMinor", op: "greater_than", value: "100" })])).toBe(
      false
    );
    expect(ruleMatches(tx({ amountMinor: 900 }), [cond({ field: "amountMinor", op: "greater_than", value: "100" })])).toBe(
      true
    );
  });

  it("rejects a non-numeric threshold instead of comparing against NaN", () => {
    // Every comparison with NaN is false, so `not_equals` would be true for
    // everything and `equals` false for everything — silently inverted.
    const numeric = cond({ field: "amountMinor", op: "not_equals", value: "mucho" });

    expect(ruleMatches(tx({ amountMinor: 1 }), [numeric])).toBe(false);
    expect(ruleMatches(tx({ amountMinor: 2 }), [numeric])).toBe(false);
  });

  it("refuses to apply a text operator to a number field", () => {
    expect(
      ruleMatches(tx({ amountMinor: 50_000 }), [cond({ field: "amountMinor", op: "contains", value: "5" })])
    ).toBe(false);
  });

  it("refuses to apply a numeric operator to a text field", () => {
    expect(
      ruleMatches(tx(), [cond({ field: "description", op: "greater_than", value: "10" })])
    ).toBe(false);
  });

  it("supports the boundary operators with the expected inclusivity", () => {
    const at = (op: RuleCondition["op"]) =>
      ruleMatches(tx({ amountMinor: 100 }), [cond({ field: "amountMinor", op, value: "100" })]);

    expect(at("greater_or_equal")).toBe(true);
    expect(at("less_or_equal")).toBe(true);
    expect(at("greater_than")).toBe(false);
    expect(at("less_than")).toBe(false);
    expect(at("equals")).toBe(true);
  });

  it("refuses an empty value on a substring operator instead of matching everything", () => {
    // `"COMPRA EN EXITO".includes("")` is true, so without the guard a rule
    // with a half-filled box would file every transaction into one category.
    for (const op of ["contains", "not_contains", "starts_with", "ends_with"] as const) {
      expect(ruleMatches(tx(), [cond({ op, value: "" })]), op).toBe(false);
      expect(ruleMatches(tx(), [cond({ op, value: "   " })]), `${op} (solo espacios)`).toBe(false);
    }
  });

  it("still allows equals with an empty value, which asks a real question", () => {
    // "The description is empty" is how a rule targets uncategorised rows, so
    // the guard must not swallow it.
    expect(ruleMatches(tx({ description: null }), [cond({ op: "equals", value: "" })])).toBe(true);
    expect(ruleMatches(tx(), [cond({ op: "equals", value: "" })])).toBe(false);
  });
});

describe("applyActions", () => {
  it("sets the fields the actions name", () => {
    const patch = applyActions(
      { categoryId: null, payeeId: null },
      [action(), action({ field: "payeeId", value: "pay-exito" })]
    );

    expect(patch).toEqual({ categoryId: "cat-mercado", payeeId: "pay-exito" });
  });

  it("lets a later action win, which is the precedence rule", () => {
    const patch = applyActions(
      { categoryId: null },
      [action({ value: "cat-primero" }), action({ value: "cat-segundo" })]
    );

    expect(patch.categoryId).toBe("cat-segundo");
  });

  it("leaves the fields untouched when there are no actions", () => {
    expect(applyActions({ categoryId: "cat-actual", payeeId: "pay-x" }, [])).toEqual({
      categoryId: "cat-actual",
      payeeId: "pay-x",
    });
  });

});

describe("stripStaleRuleReferences", () => {
  // Conditions can only name description / payeeId / accountId / amountMinor,
  // while actions can only name categoryId / payeeId. So a deleted category
  // only ever appears in actions, and a deleted payee appears in both — which is
  // the reason this function takes the field to strip on.
  const deletedCategory = new Set(["cat-borrada"]);
  const deletedPayee = new Set(["pay-borrado"]);

  it("drops the actions that pointed at a deleted category, keeping conditions", () => {
    const result = stripStaleRuleReferences(
      {
        conditions: [cond(), cond({ field: "payeeId", op: "equals", value: "pay-exito" })],
        actions: [action({ field: "categoryId", value: "cat-borrada" }), action()],
      },
      "categoryId",
      deletedCategory
    );

    expect(result.conditions).toHaveLength(2);
    expect(result.actions).toEqual([action()]);
    expect(result.changed).toBe(true);
  });

  it("strips conditions and actions together for a deleted payee", () => {
    const result = stripStaleRuleReferences(
      {
        conditions: [
          cond({ field: "payeeId", op: "equals", value: "pay-borrado" }),
          cond(),
        ],
        actions: [action({ field: "payeeId", value: "pay-borrado" })],
      },
      "payeeId",
      deletedPayee
    );

    expect(result.conditions).toEqual([cond()]);
    expect(result.actions).toEqual([]);
    expect(result.changed).toBe(true);
  });

  it("leaves references to other fields alone even if the text matches an id", () => {
    // A description that happens to contain the deleted id's text must survive:
    // this strips by field, not by string search.
    const result = stripStaleRuleReferences(
      {
        conditions: [cond({ field: "description", value: "pay-borrado" })],
        actions: [],
      },
      "payeeId",
      deletedPayee
    );

    expect(result.conditions).toHaveLength(1);
    expect(result.changed).toBe(false);
  });

  it("reports no change when nothing referenced the deleted ids", () => {
    const result = stripStaleRuleReferences(
      { conditions: [cond()], actions: [action()] },
      "categoryId",
      deletedCategory
    );

    expect(result.changed).toBe(false);
  });

  it("empties a rule whose conditions were all deleted, so it stops matching", () => {
    // The reason this function exists: a rule left with zero conditions would
    // otherwise be a rule that can never fire, and `ruleMatches` refuses those
    // on purpose — but only if the rule is emptied deliberately.
    const result = stripStaleRuleReferences(
      { conditions: [cond({ field: "payeeId", op: "equals", value: "pay-borrado" })], actions: [] },
      "payeeId",
      deletedPayee
    );

    expect(result.conditions).toEqual([]);
    expect(ruleMatches(tx(), result.conditions, "all")).toBe(false);
  });
});

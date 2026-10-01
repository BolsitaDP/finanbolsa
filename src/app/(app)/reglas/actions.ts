"use server";

import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categories, payees, rules, transactions } from "@/db/schema";
import { applyActions, resolveRuleFields, ruleMatches } from "@/lib/rules";
import type {
  RuleAction,
  RuleCondition,
  RuleMatchType,
} from "@/lib/rules-types";
import type { ApplicableRule, LiveTargets } from "@/lib/rules";

type RuleInput = {
  name: string | null;
  matchType: RuleMatchType;
  conditions: RuleCondition[];
  actions: RuleAction[];
};

/**
 * Next sort order for a new rule.
 *
 * Exported because the import flow creates rules too, and it used to hardcode
 * 999 for every one of them. That made precedence a coin flip: the engine
 * applies rules ordered by `sortOrder`, so with dozens of rules tied at 999,
 * which one won depended on whatever order SQLite happened to return rows in —
 * and nothing in the UI let the user see or change it. Same source of truth
 * for both creators is the fix; a stable order is what makes "later rules
 * override earlier ones" mean something.
 */
export async function nextRuleSortOrder(): Promise<number> {
  const existing = await db.select({ sortOrder: rules.sortOrder }).from(rules);
  return existing.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1;
}

export async function createRule(input: RuleInput) {
  await db.insert(rules).values({
    name: input.name,
    matchType: input.matchType,
    conditions: input.conditions,
    actions: input.actions,
    sortOrder: await nextRuleSortOrder(),
  });
  revalidatePath("/reglas");
}

/**
 * Quick-create a rule from a transaction's (possibly user-edited) condition
 * text, category, and payee — confirmed via a preview dialog before this is
 * called, so the user doesn't have to retype it on the Reglas page. If a rule
 * with the exact same condition already exists, reaffirm it (update its
 * actions, force enabled) instead of creating a duplicate — mirrors the
 * upsert used by the "Regla" checkbox in the import flow.
 */
export async function createRuleFromTransaction(input: {
  merchantLabel: string;
  categoryId: string | null;
  payeeId: string | null;
}) {
  const merchantLabel = input.merchantLabel.trim();
  if (!merchantLabel) {
    throw new Error("La condición de la regla no puede estar vacía.");
  }
  if (!input.categoryId && !input.payeeId) {
    throw new Error("Selecciona una categoría o un payee para la regla.");
  }

  const conditions: RuleCondition[] = [{ field: "description", op: "contains", value: merchantLabel }];
  const actions: RuleAction[] = [
    ...(input.categoryId ? [{ field: "categoryId", value: input.categoryId } as RuleAction] : []),
    ...(input.payeeId ? [{ field: "payeeId", value: input.payeeId } as RuleAction] : []),
  ];
  const signature = JSON.stringify(conditions);

  const existingRules = await db
    .select({ id: rules.id, conditions: rules.conditions, sortOrder: rules.sortOrder })
    .from(rules);
  const match = existingRules.find((r) => JSON.stringify(r.conditions) === signature);

  if (match) {
    await db.update(rules).set({ actions, enabled: true }).where(eq(rules.id, match.id));
  } else {
    const maxOrder = existingRules.reduce((m, r) => Math.max(m, r.sortOrder), 0);
    await db.insert(rules).values({
      name: merchantLabel,
      conditions,
      actions,
      sortOrder: maxOrder + 1,
    });
  }

  revalidatePath("/reglas");
  revalidatePath("/transacciones");
  revalidatePath("/");
  return { merchantLabel };
}

export async function updateRule(id: number, input: RuleInput) {
  await db.update(rules).set(input).where(eq(rules.id, id));
  revalidatePath("/reglas");
}

export async function deleteRule(id: number) {
  await db.delete(rules).where(eq(rules.id, id));
  revalidatePath("/reglas");
}

export async function toggleRuleEnabled(id: number, enabled: boolean) {
  await db.update(rules).set({ enabled }).where(eq(rules.id, id));
  revalidatePath("/reglas");
}

export async function bulkDeleteRules(ids: number[]) {
  if (ids.length === 0) return;
  await db.delete(rules).where(inArray(rules.id, ids));
  revalidatePath("/reglas");
}

export type BulkRulePatch = Partial<{
  enabled: boolean;
}>;

export async function bulkUpdateRules(ids: number[], patch: BulkRulePatch) {
  if (ids.length === 0 || Object.keys(patch).length === 0) return;
  await db.update(rules).set(patch).where(inArray(rules.id, ids));
  revalidatePath("/reglas");
}

export type RulePreviewSample = {
  date: string;
  description: string | null;
  amountMinor: number;
  currency: string;
  type: string;
};

/**
 * Dry-run: how many existing transactions would this rule (as currently
 * being edited, not yet saved) match? Lets the rule builder show that count
 * live, so a new rule's overlap with existing ones — or how broad/narrow its
 * pattern is — is visible before it gets added to the pile.
 */
export async function previewRuleMatches(conditions: RuleCondition[], matchType: RuleMatchType) {
  if (conditions.length === 0 || conditions.some((c) => !c.value)) {
    return { count: 0, sample: [] as RulePreviewSample[] };
  }
  const allTransactions = await db
    .select()
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .orderBy(desc(transactions.date));

  const matches = allTransactions.filter((tx) => ruleMatches(tx, conditions, matchType));
  const sample: RulePreviewSample[] = matches.slice(0, 5).map((tx) => ({
    date: tx.date.toISOString(),
    description: tx.description,
    amountMinor: tx.amountMinor,
    currency: tx.currency,
    type: tx.type,
  }));
  return { count: matches.length, sample };
}

export async function applyRulesToTransactions() {
  const [allRules, allTransactions, validCategories, validPayees] = await Promise.all([
    db.select().from(rules).where(eq(rules.enabled, true)).orderBy(asc(rules.sortOrder)),
    db.select().from(transactions).where(isNull(transactions.deletedAt)),
    db.select({ id: categories.id }).from(categories),
    db.select({ id: payees.id }).from(payees),
  ]);
  // A rule's actions are a JSON blob, not a real foreign key, so deleting a
  // category or payee doesn't automatically clean up rules that still
  // reference it — an action pointing at a since-deleted id would otherwise
  // hit a raw FK error on the transactions.set() below and abort the entire
  // run partway through, silently skipping every rule after it.
  const live: LiveTargets = {
    categoryIds: new Set(validCategories.map((c) => c.id)),
    payeeIds: new Set(validPayees.map((p) => p.id)),
  };
  // Only the fields the engine can set, and only the rules it can evaluate.
  const applicable: ApplicableRule[] = allRules.map((rule) => ({
    conditions: rule.conditions as RuleCondition[],
    actions: rule.actions as RuleAction[],
    matchType: rule.matchType as RuleMatchType,
  }));

  let updated = 0;
  for (const tx of allTransactions) {
    const patch = resolveRuleFields(tx, applicable, live);
    const changed =
      (patch.categoryId !== undefined && patch.categoryId !== tx.categoryId) ||
      (patch.payeeId !== undefined && patch.payeeId !== tx.payeeId);
    if (changed) {
      await db.update(transactions).set(patch).where(eq(transactions.id, tx.id));
      updated++;
    }
  }

  revalidatePath("/transacciones");
  revalidatePath("/reglas");
  revalidatePath("/");
  return { updated, total: allTransactions.length };
}

/**
 * The rule engine, reachable while typing — ROADMAP §2.4.
 *
 * The rules already ran, but only from this page, in bulk, over rows that were
 * already saved. That is the wrong end of the loop: the moment a category is
 * worth getting right is while entering the transaction, and correcting it
 * afterwards is exactly the work this is meant to remove (principle 4).
 *
 * Returns labels as well as ids, so the client can show what it found. That is
 * the whole point of asking *before* saving: a category filled in silently is
 * indistinguishable from one the user chose, and they would have no reason to
 * check it.
 *
 * Read-only, so no revalidation — nothing was written. `createTransaction`
 * applies the same resolution server-side as the safety net for entry points
 * that don't go through this form.
 */
export async function suggestFromRules(input: {
  description: string | null;
  payeeId: string | null;
  accountId: string;
  amountMinor: number;
}) {
  const [fields, allCategories, allPayees] = await Promise.all([
    resolveRuleFieldsFor(input),
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db.select({ id: payees.id, name: payees.name }).from(payees),
  ]);

  const category = fields.categoryId
    ? allCategories.find((c) => c.id === fields.categoryId)
    : undefined;
  const payee = fields.payeeId ? allPayees.find((p) => p.id === fields.payeeId) : undefined;

  return {
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    payeeId: payee?.id ?? null,
    payeeName: payee?.name ?? null,
  };
}

/**
 * Loads the enabled rules and resolves one transaction against them.
 *
 * Shared by the suggestion above and by `createTransaction`, which is the point:
 * the two must agree, or the row that lands differs from the one the user was
 * shown. A rule engine with two implementations is one whose suggestion is
 * wrong half the time, with no way to tell which produced a given row.
 */
export async function resolveRuleFieldsFor(tx: {
  description: string | null;
  payeeId: string | null;
  accountId: string;
  amountMinor: number;
}) {
  const [allRules, allCategories, allPayees] = await Promise.all([
    db.select().from(rules).where(eq(rules.enabled, true)).orderBy(asc(rules.sortOrder)),
    db.select({ id: categories.id }).from(categories),
    db.select({ id: payees.id }).from(payees),
  ]);

  const live: LiveTargets = {
    categoryIds: new Set(allCategories.map((c) => c.id)),
    payeeIds: new Set(allPayees.map((p) => p.id)),
  };
  const applicable: ApplicableRule[] = allRules.map((rule) => ({
    conditions: rule.conditions as RuleCondition[],
    actions: rule.actions as RuleAction[],
    matchType: rule.matchType as RuleMatchType,
  }));

  return resolveRuleFields(tx, applicable, live);
}

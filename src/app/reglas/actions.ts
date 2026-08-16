"use server";

import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categories, payees, rules, transactions } from "@/db/schema";
import { applyActions, ruleMatches } from "@/lib/rules";
import type { RuleAction, RuleCondition, RuleMatchType } from "@/lib/rules-types";

type RuleInput = {
  name: string | null;
  matchType: RuleMatchType;
  conditions: RuleCondition[];
  actions: RuleAction[];
};

export async function createRule(input: RuleInput) {
  const existing = await db.select({ sortOrder: rules.sortOrder }).from(rules);
  const maxOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  await db.insert(rules).values({
    name: input.name,
    matchType: input.matchType,
    conditions: input.conditions,
    actions: input.actions,
    sortOrder: maxOrder + 1,
  });
  revalidatePath("/reglas");
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
  const validCategoryIds = new Set(validCategories.map((c) => c.id));
  const validPayeeIds = new Set(validPayees.map((p) => p.id));

  let updated = 0;
  for (const tx of allTransactions) {
    const patch: { categoryId?: string | null; payeeId?: string | null } = {};
    for (const rule of allRules) {
      if (ruleMatches(tx, rule.conditions, rule.matchType as RuleMatchType)) {
        const liveActions = rule.actions.filter(
          (a) =>
            (a.field === "categoryId" && validCategoryIds.has(a.value)) ||
            (a.field === "payeeId" && validPayeeIds.has(a.value))
        );
        applyActions(patch, liveActions);
      }
    }
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

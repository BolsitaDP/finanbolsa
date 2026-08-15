"use server";

import { asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { rules, transactions } from "@/db/schema";
import { applyActions, ruleMatches } from "@/lib/rules";
import type { RuleAction, RuleCondition } from "@/lib/rules-types";

type RuleInput = {
  name: string | null;
  conditions: RuleCondition[];
  actions: RuleAction[];
};

export async function createRule(input: RuleInput) {
  const existing = await db.select({ sortOrder: rules.sortOrder }).from(rules);
  const maxOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  await db.insert(rules).values({
    name: input.name,
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

export async function applyRulesToTransactions() {
  const [allRules, allTransactions] = await Promise.all([
    db.select().from(rules).where(eq(rules.enabled, true)).orderBy(asc(rules.sortOrder)),
    db.select().from(transactions).where(isNull(transactions.deletedAt)),
  ]);

  let updated = 0;
  for (const tx of allTransactions) {
    const patch: { categoryId?: string | null; payeeId?: string | null } = {};
    for (const rule of allRules) {
      if (ruleMatches(tx, rule.conditions)) {
        applyActions(patch, rule.actions);
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

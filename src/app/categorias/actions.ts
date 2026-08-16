"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { budgets, categories, payees, rules, transactions } from "@/db/schema";
import { uniqueId } from "@/lib/slug";
import { stripStaleRuleReferences } from "@/lib/rules";
import type { CategoryKind, CategoryStatus } from "@/lib/enums";

type CategoryInput = {
  name: string;
  parentCategoryId: string | null;
  kind: CategoryKind;
  status: CategoryStatus;
  notes: string | null;
};

export async function createCategory(input: CategoryInput) {
  const existing = await db.select({ id: categories.id }).from(categories);
  const id = uniqueId("cat", input.name, existing.map((c) => c.id));
  await db.insert(categories).values({ id, ...input });
  revalidatePath("/categorias");
}

export async function updateCategory(id: string, input: CategoryInput) {
  await db.update(categories).set(input).where(eq(categories.id, id));
  revalidatePath("/categorias");
}

function revalidateCategoryDelete() {
  revalidatePath("/categorias");
  revalidatePath("/transacciones");
  revalidatePath("/payees");
  revalidatePath("/presupuesto");
  revalidatePath("/reglas");
}

async function unlinkCategoriesFromRules(ids: string[]) {
  const deletedIds = new Set(ids);
  const allRules = await db.select().from(rules);
  for (const rule of allRules) {
    const result = stripStaleRuleReferences(rule, "categoryId", deletedIds);
    if (!result.changed) continue;
    const stillValid = result.conditions.length > 0 && result.actions.length > 0;
    await db
      .update(rules)
      .set({
        conditions: result.conditions,
        actions: result.actions,
        // A rule needs at least one condition and one action to mean
        // anything — disable it rather than leave it silently broken or
        // guess at a replacement for what got deleted.
        enabled: stillValid ? rule.enabled : false,
      })
      .where(eq(rules.id, rule.id));
  }
}

export async function deleteCategory(id: string) {
  // Unlink everything that references this category first, or the delete
  // fails with a raw FOREIGN KEY constraint error. Subcategories are
  // promoted to top-level rather than deleted. Rules aren't a real foreign
  // key (their actions are a JSON blob), so a stale categoryId action
  // wouldn't error here — but it would throw the next time rules are
  // applied, so it gets cleaned up too.
  await db.update(transactions).set({ categoryId: null }).where(eq(transactions.categoryId, id));
  await db.update(payees).set({ defaultCategoryId: null }).where(eq(payees.defaultCategoryId, id));
  await db.delete(budgets).where(eq(budgets.categoryId, id));
  await db.update(categories).set({ parentCategoryId: null }).where(eq(categories.parentCategoryId, id));
  await unlinkCategoriesFromRules([id]);
  await db.delete(categories).where(eq(categories.id, id));
  revalidateCategoryDelete();
}

export async function bulkDeleteCategories(ids: string[]) {
  if (ids.length === 0) return;
  await db.update(transactions).set({ categoryId: null }).where(inArray(transactions.categoryId, ids));
  await db.update(payees).set({ defaultCategoryId: null }).where(inArray(payees.defaultCategoryId, ids));
  await db.delete(budgets).where(inArray(budgets.categoryId, ids));
  await db.update(categories).set({ parentCategoryId: null }).where(inArray(categories.parentCategoryId, ids));
  await unlinkCategoriesFromRules(ids);
  await db.delete(categories).where(inArray(categories.id, ids));
  revalidateCategoryDelete();
}

export type BulkCategoryPatch = Partial<{
  parentCategoryId: string | null;
  kind: CategoryKind;
  status: CategoryStatus;
}>;

export async function bulkUpdateCategories(ids: string[], patch: BulkCategoryPatch) {
  if (ids.length === 0 || Object.keys(patch).length === 0) return;
  await db.update(categories).set(patch).where(inArray(categories.id, ids));
  revalidatePath("/categorias");
}

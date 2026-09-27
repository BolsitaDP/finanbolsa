"use server";

import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { payees, rules, transactions } from "@/db/schema";
import { stripStaleRuleReferences } from "@/lib/rules";

type PayeeInput = {
  name: string;
  defaultCategoryId: string | null;
  notes: string | null;
};

export async function createPayee(input: PayeeInput) {
  await db.insert(payees).values({
    id: randomUUID(),
    name: input.name,
    defaultCategoryId: input.defaultCategoryId,
    notes: input.notes,
  });
  revalidatePath("/payees");
}

export async function updatePayee(id: string, input: PayeeInput) {
  await db.update(payees).set(input).where(eq(payees.id, id));
  revalidatePath("/payees");
}

async function unlinkPayeesFromRules(ids: string[]) {
  const deletedIds = new Set(ids);
  const allRules = await db.select().from(rules);
  for (const rule of allRules) {
    const result = stripStaleRuleReferences(rule, "payeeId", deletedIds);
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

export async function deletePayee(id: string) {
  // Transactions referencing this payee must be un-linked first, or the
  // delete fails with a raw FOREIGN KEY constraint error. Rules that
  // reference it (in a condition or as an action) aren't a real foreign key,
  // so they wouldn't error here — but a stale action id would throw the next
  // time rules are applied, so they get cleaned up too.
  await db.update(transactions).set({ payeeId: null }).where(eq(transactions.payeeId, id));
  await unlinkPayeesFromRules([id]);
  await db.delete(payees).where(eq(payees.id, id));
  revalidatePath("/payees");
  revalidatePath("/transacciones");
  revalidatePath("/reglas");
}

export async function bulkDeletePayees(ids: string[]) {
  if (ids.length === 0) return;
  await db.update(transactions).set({ payeeId: null }).where(inArray(transactions.payeeId, ids));
  await unlinkPayeesFromRules(ids);
  await db.delete(payees).where(inArray(payees.id, ids));
  revalidatePath("/payees");
  revalidatePath("/transacciones");
  revalidatePath("/reglas");
}

export type BulkPayeePatch = Partial<{
  defaultCategoryId: string | null;
}>;

export async function bulkUpdatePayees(ids: string[], patch: BulkPayeePatch) {
  if (ids.length === 0 || Object.keys(patch).length === 0) return;
  await db.update(payees).set(patch).where(inArray(payees.id, ids));
  revalidatePath("/payees");
}

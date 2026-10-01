"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { accounts, budgets, categories, payees, rules, transactions } from "@/db/schema";
import { assertAuthenticated } from "@/lib/auth-session";
import { saveSettings } from "@/lib/settings-store";
import type { Currency } from "@/lib/enums";

type SettingsInput = {
  baseCurrency: Currency;
  startDate: Date;
  owner: string | null;
  notes: string | null;
};

export async function updateSettings(input: SettingsInput) {
  await assertAuthenticated();
  await saveSettings(input);
  revalidatePath("/configuracion");
  revalidatePath("/presupuesto");
}

function revalidateEverything() {
  revalidatePath("/");
  revalidatePath("/transacciones");
  revalidatePath("/categorias");
  revalidatePath("/payees");
  revalidatePath("/reglas");
  revalidatePath("/presupuesto");
  revalidatePath("/cuentas");
  revalidatePath("/importar");
  revalidatePath("/configuracion");
}

export async function resetTransactions() {
  await assertAuthenticated();
  const rows = await db.select({ id: transactions.id }).from(transactions);
  await db.delete(transactions);
  revalidateEverything();
  return rows.length;
}

export async function resetBudgets() {
  await assertAuthenticated();
  const rows = await db.select({ id: budgets.id }).from(budgets);
  await db.delete(budgets);
  revalidateEverything();
  return rows.length;
}

export async function resetRules() {
  await assertAuthenticated();
  const rows = await db.select({ id: rules.id }).from(rules);
  await db.delete(rules);
  revalidateEverything();
  return rows.length;
}

export async function resetPayees() {
  await assertAuthenticated();
  const rows = await db.select({ id: payees.id }).from(payees);
  await db.update(transactions).set({ payeeId: null });
  await db.delete(payees);
  revalidateEverything();
  return rows.length;
}

export async function resetCategories() {
  await assertAuthenticated();
  const rows = await db.select({ id: categories.id }).from(categories);
  await db.update(transactions).set({ categoryId: null });
  await db.update(payees).set({ defaultCategoryId: null });
  await db.delete(budgets); // budgets.categoryId is NOT NULL, can't survive an orphaned reference
  await db.update(categories).set({ parentCategoryId: null }); // clear self-references first
  await db.delete(categories);
  revalidateEverything();
  return rows.length;
}

export async function resetAccounts() {
  await assertAuthenticated();
  const rows = await db.select({ id: accounts.id }).from(accounts);
  await db.delete(transactions); // accountId is NOT NULL, can't survive an orphaned reference
  await db.delete(accounts);
  revalidateEverything();
  return rows.length;
}

/** Wipes everything except accounts and settings, in FK-safe order. */
export async function resetAllExceptAccounts() {
  await assertAuthenticated();
  const [txRows, budgetRows, ruleRows, payeeRows, categoryRows] = await Promise.all([
    db.select({ id: transactions.id }).from(transactions),
    db.select({ id: budgets.id }).from(budgets),
    db.select({ id: rules.id }).from(rules),
    db.select({ id: payees.id }).from(payees),
    db.select({ id: categories.id }).from(categories),
  ]);

  await db.delete(transactions);
  await db.delete(budgets);
  await db.delete(rules);
  await db.delete(payees);
  await db.update(categories).set({ parentCategoryId: null });
  await db.delete(categories);

  revalidateEverything();
  return {
    transactions: txRows.length,
    budgets: budgetRows.length,
    rules: ruleRows.length,
    payees: payeeRows.length,
    categories: categoryRows.length,
  };
}

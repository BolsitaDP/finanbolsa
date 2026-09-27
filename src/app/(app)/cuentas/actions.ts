"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { accounts } from "@/db/schema";
import { uniqueId } from "@/lib/slug";
import type { AccountStatus, AccountType, Currency } from "@/lib/enums";

type AccountInput = {
  name: string;
  type: AccountType;
  currency: Currency;
  creditLimitMinor: number | null;
  status: AccountStatus;
  openedAt: Date | null;
  notes: string | null;
  referenceDate: Date;
  referenceBalanceMinor: number;
};

export async function createAccount(input: AccountInput) {
  const existing = await db.select({ id: accounts.id }).from(accounts);
  const id = uniqueId("acc", input.name, existing.map((a) => a.id));
  await db.insert(accounts).values({ id, ...input });
  revalidatePath("/cuentas");
  revalidatePath("/");
}

export async function updateAccount(id: string, input: AccountInput) {
  await db.update(accounts).set(input).where(eq(accounts.id, id));
  revalidatePath("/cuentas");
  revalidatePath("/");
}

export async function deleteAccount(id: string) {
  await db.delete(accounts).where(eq(accounts.id, id));
  revalidatePath("/cuentas");
  revalidatePath("/");
}

export async function bulkDeleteAccounts(ids: string[]) {
  if (ids.length === 0) return;
  await db.delete(accounts).where(inArray(accounts.id, ids));
  revalidatePath("/cuentas");
  revalidatePath("/");
}

export type BulkAccountPatch = Partial<{
  type: AccountType;
  currency: Currency;
  status: AccountStatus;
}>;

export async function bulkUpdateAccounts(ids: string[], patch: BulkAccountPatch) {
  if (ids.length === 0 || Object.keys(patch).length === 0) return;
  await db.update(accounts).set(patch).where(inArray(accounts.id, ids));
  revalidatePath("/cuentas");
  revalidatePath("/");
}

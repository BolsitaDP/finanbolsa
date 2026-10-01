"use server";

import { count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
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


/**
 * Archives an account without touching anything else.
 *
 * A dedicated action rather than reusing `updateAccount`, which takes a full
 * AccountInput: sending the whole row from the table would write back whatever
 * it looked like when rendered, clobbering any edit made meanwhile.
 */
export async function archiveAccount(id: string) {
  await db.update(accounts).set({ status: "archived" }).where(eq(accounts.id, id));
  revalidatePath("/cuentas");
  revalidatePath("/");
}

export async function unarchiveAccount(id: string) {
  await db.update(accounts).set({ status: "active" }).where(eq(accounts.id, id));
  revalidatePath("/cuentas");
  revalidatePath("/");
}

/**
 * How many transactions still reference each of `ids`. The accounts table uses
 * this to explain, before anything is attempted, that deleting an account with
 * history will fail — `transactions.accountId` is NOT NULL with a foreign key,
 * and the delete used to surface as a raw SQLite error in English.
 */
export async function countTransactionsByAccount(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ accountId: transactions.accountId, value: count() })
    .from(transactions)
    .where(inArray(transactions.accountId, ids))
    .groupBy(transactions.accountId);
  return Object.fromEntries(rows.map((r) => [r.accountId, r.value]));
}

/**
 * Deletes an account, or refuses with a Spanish explanation if it still has
 * transactions.
 *
 * The previous version deleted unconditionally and let the foreign key reject
 * it, so the UI offered a button it knew would fail and the user got
 * "FOREIGN KEY constraint failed" — with the account still there and no idea
 * what to do. Archiving (`status`) is the right action for a closed account
 * that has history, and it is what the caller should reach for instead.
 */
export async function deleteAccount(id: string) {
  const used = await countTransactionsByAccount([id]);
  const total = used[id] ?? 0;
  if (total > 0) {
    throw new Error(
      `Esta cuenta tiene ${total} transacción(es) asociadas y no se puede eliminar. ` +
        `Archívala en su lugar: conserva el historial y la deja de contar como cuenta activa.`
    );
  }
  await db.delete(accounts).where(eq(accounts.id, id));
  revalidatePath("/cuentas");
  revalidatePath("/");
}


export async function bulkDeleteAccounts(ids: string[]) {
  if (ids.length === 0) return;
  const used = await countTransactionsByAccount(ids);
  const blocked = ids.filter((id) => (used[id] ?? 0) > 0);
  if (blocked.length > 0) {
    throw new Error(
      `No se eliminaron cuentas: ${blocked.length} de las ${ids.length} seleccionadas tienen transacciones asociadas. ` +
        `Archivalas en su lugar.`
    );
  }
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


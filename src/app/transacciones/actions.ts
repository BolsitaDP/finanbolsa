"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { transactions, transactionSplits } from "@/db/schema";
import type { Currency, TransactionType } from "@/lib/enums";

type TransactionInput = {
  date: Date;
  type: TransactionType;
  accountId: string;
  destinationAccountId: string | null;
  amountMinor: number;
  currency: Currency;
  destinationAmountMinor: number | null;
  destinationCurrency: Currency | null;
  categoryId: string | null;
  payeeId: string | null;
  description: string | null;
  projectTrip: string | null;
  notes: string | null;
};

export type SplitInput = {
  amountMinor: number;
  categoryId: string | null;
  payeeId: string | null;
  description: string | null;
};

function revalidateAll() {
  revalidatePath("/transacciones");
  revalidatePath("/");
  revalidatePath("/presupuesto");
  revalidatePath("/cuentas");
  revalidatePath("/categorias/[id]", "page");
}

async function replaceSplits(transactionId: number, splits: SplitInput[]) {
  await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId));
  if (splits.length > 0) {
    await db.insert(transactionSplits).values(splits.map((s) => ({ ...s, transactionId })));
  }
}

export async function createTransaction(input: TransactionInput, splits: SplitInput[] = []) {
  const [inserted] = await db.insert(transactions).values(input).returning({ id: transactions.id });
  if (splits.length > 0) await replaceSplits(inserted.id, splits);
  revalidateAll();
}

export async function updateTransaction(id: number, input: TransactionInput, splits: SplitInput[] = []) {
  await db.update(transactions).set(input).where(eq(transactions.id, id));
  await replaceSplits(id, splits);
  revalidateAll();
}

export async function softDeleteTransaction(id: number) {
  await db.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, id));
  await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, id));
  revalidateAll();
}

export async function bulkSoftDeleteTransactions(ids: number[]) {
  if (ids.length === 0) return;
  await db.update(transactions).set({ deletedAt: new Date() }).where(inArray(transactions.id, ids));
  await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, ids));
  revalidateAll();
}

export type BulkTransactionPatch = Partial<{
  type: TransactionType;
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  payeeId: string | null;
  projectTrip: string | null;
  notes: string | null;
}>;

export async function bulkUpdateTransactions(ids: number[], patch: BulkTransactionPatch) {
  if (ids.length === 0 || Object.keys(patch).length === 0) return;
  await db.update(transactions).set(patch).where(inArray(transactions.id, ids));
  revalidateAll();
}

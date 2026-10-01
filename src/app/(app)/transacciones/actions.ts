"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { transactions, transactionSplits } from "@/db/schema";
import {
  bulkTransactionPatchSchema,
  findInvalidTransfers,
  parseOrThrow,
  splitInputSchema,
  transactionInputSchema,
  type ValidatedBulkPatch,
  type ValidatedSplit,
  type ValidatedTransaction,
} from "@/lib/schemas";

export type TransactionInput = ValidatedTransaction;

export type SplitInput = ValidatedSplit;

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
  // The exported types are compile-time only: a server action is an endpoint
  // that accepts whatever JSON it is posted. Validate for real before writing.
  const tx = parseOrThrow(transactionInputSchema, input);
  const parsedSplits = splits.map((s) => parseOrThrow(splitInputSchema, s));

  const [inserted] = await db
    .insert(transactions)
    .values({ ...tx, updatedAt: new Date() })
    .returning({ id: transactions.id });
  if (parsedSplits.length > 0) await replaceSplits(inserted.id, parsedSplits);
  revalidateAll();
}

/**
 * Changes only a transaction's category.
 *
 * For the inline cell editor. Deliberately NOT `updateTransaction`: that takes
 * a full TransactionInput, and the table's copy of a row is not guaranteed to
 * be current, so saving it back would clobber fields the user never touched.
 * Splits are left alone on purpose — a split keeps its own category, and
 * `categoryAllocations` gives the parent only the un-split remainder, so the
 * change is exactly what the user sees: the remainder moves.
 */
export async function setTransactionCategory(id: number, categoryId: string | null) {
  await db
    .update(transactions)
    .set({ categoryId, updatedAt: new Date() })
    .where(eq(transactions.id, id));
  revalidateAll();
}

export async function updateTransaction(id: number, input: TransactionInput, splits: SplitInput[] = []) {
  const tx = parseOrThrow(transactionInputSchema, input);
  const parsedSplits = splits.map((s) => parseOrThrow(splitInputSchema, s));

  // `updatedAt` existed in the schema and was never written by any action, so
  // it silently always equalled `createdAt`. A field that lies about how fresh
  // a row is is worse than not having it.
  await db
    .update(transactions)
    .set({ ...tx, updatedAt: new Date() })
    .where(eq(transactions.id, id));
  await replaceSplits(id, parsedSplits);
  revalidateAll();
}

export async function softDeleteTransaction(id: number) {
  await db.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, id));
  await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, id));
  revalidateAll();
}

/**
 * Undoes a soft delete. Without this, "soft" delete buys nothing: the rows are
 * marked rather than removed, but nothing in the app could ever bring them back.
 */
export async function restoreTransaction(id: number) {
  await db
    .update(transactions)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(transactions.id, id));
  revalidateAll();
}

export async function bulkSoftDeleteTransactions(ids: number[]) {
  if (ids.length === 0) return;
  await db.update(transactions).set({ deletedAt: new Date() }).where(inArray(transactions.id, ids));
  await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, ids));
  revalidateAll();
}

/**
 * Undoes a bulk soft delete. Pairs with `bulkSoftDeleteTransactions` to make
 * the destructive table action reversible within the toast's undo window.
 */
export async function bulkRestoreTransactions(ids: number[]) {
  if (ids.length === 0) return;
  await db.update(transactions).set({ deletedAt: null }).where(inArray(transactions.id, ids));
  revalidateAll();
}

export type BulkTransactionPatch = ValidatedBulkPatch;

/**
 * How many of `ids` carry splits. The bulk-edit dialog uses this to warn that
 * changing their category only moves the un-split remainder — see splits.ts:
 * each split keeps its own category, and the parent only gets what's left over.
 */
export async function countWithSplits(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .select({ id: transactionSplits.transactionId })
    .from(transactionSplits)
    .where(inArray(transactionSplits.transactionId, ids));
  return new Set(rows.map((r) => r.id)).size;
}

export async function bulkUpdateTransactions(ids: number[], patch: BulkTransactionPatch) {
  if (ids.length === 0 || Object.keys(patch).length === 0) return;
  const clean = parseOrThrow(bulkTransactionPatchSchema, patch);

  // Whether a *row* ends up valid can't be judged from the patch alone, since
  // that depends on the row's own type. Check each one against its current
  // state and refuse the whole batch rather than write destinationless
  // transfers, which would debit the source and credit nobody.
  const current = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      accountId: transactions.accountId,
      destinationAccountId: transactions.destinationAccountId,
    })
    .from(transactions)
    .where(inArray(transactions.id, ids));

  const invalid = findInvalidTransfers(clean, current);
  if (invalid.length > 0) {
    throw new Error(
      `No se aplicó el cambio: ${invalid.length} transacción(es) quedarían con una cuenta destino que no corresponde ` +
        `a su tipo. Una transferencia necesita cuenta destino, y los demás tipos no la llevan.`
    );
  }

  await db
    .update(transactions)
    .set({ ...clean, updatedAt: new Date() })
    .where(inArray(transactions.id, ids));
  revalidateAll();
}

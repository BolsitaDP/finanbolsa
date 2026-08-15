"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { transactions } from "@/db/schema";
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

function revalidateAll() {
  revalidatePath("/transacciones");
  revalidatePath("/");
  revalidatePath("/presupuesto");
  revalidatePath("/cuentas");
}

export async function createTransaction(input: TransactionInput) {
  await db.insert(transactions).values(input);
  revalidateAll();
}

export async function updateTransaction(id: number, input: TransactionInput) {
  await db.update(transactions).set(input).where(eq(transactions.id, id));
  revalidateAll();
}

export async function softDeleteTransaction(id: number) {
  await db.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, id));
  revalidateAll();
}

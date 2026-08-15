"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { payees } from "@/db/schema";

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

export async function deletePayee(id: string) {
  await db.delete(payees).where(eq(payees.id, id));
  revalidatePath("/payees");
}

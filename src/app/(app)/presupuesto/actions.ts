"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { budgets } from "@/db/schema";

export async function setBudgetAmount(categoryId: string, month: string, amountMinor: number) {
  await db
    .insert(budgets)
    .values({ categoryId, month, budgetedMinor: amountMinor })
    .onConflictDoUpdate({
      target: [budgets.categoryId, budgets.month],
      set: { budgetedMinor: amountMinor },
    });
  revalidatePath("/presupuesto");
}

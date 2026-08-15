"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { uniqueId } from "@/lib/slug";
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

export async function deleteCategory(id: string) {
  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/categorias");
}

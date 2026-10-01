"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { dismissedRecurring } from "@/db/schema";

/**
 * "Esto no es una suscripción" — ROADMAP §2.2.
 *
 * Con el umbral actual, cualquier cosa que aparezca en tres meses con montos
 * parecidos entra: una tienda a la que vas cada quince días cae en tres meses
 * distintos. No había forma de decir "este no", así que la lista solo crecía y el
 * usuario aprendía a ojearla, que es justo lo contrario de lo que sirven las
 * alertas de arriba.
 *
 * La clave es la del grupo de detección (`payee:<id>` o `desc:<comercio>`), no un
 * id: un grupo por descripción no tiene fila propia, y anclar al mismo
 * identificador que usa la detección es lo que hace que el descarte sobreviva a
 * que la etiqueta se vuelva a limpiar.
 *
 * No caduca a propósito: "no es una suscripción" es una afirmación sobre el
 * comercio, no sobre un periodo. Y se deshace desde la misma página.
 */
export async function dismissRecurring(key: string) {
  await db.insert(dismissedRecurring).values({ key }).onConflictDoNothing();
  revalidatePath("/recurrentes");
}

export async function restoreRecurring(key: string) {
  await db.delete(dismissedRecurring).where(eq(dismissedRecurring.key, key));
  revalidatePath("/recurrentes");
}

export async function restoreAllRecurring(keys: string[]) {
  if (keys.length === 0) return;
  await db.delete(dismissedRecurring).where(inArray(dismissedRecurring.key, keys));
  revalidatePath("/recurrentes");
}

/**
 * The dismissed group keys, as a set for filtering.
 *
 * Small by construction: a dismissal is one row and there is one dismissal per
 * merchant, so a full table read is cheaper than a set membership test per group.
 */
export async function getDismissedRecurring(): Promise<Set<string>> {
  const rows = await db.select({ key: dismissedRecurring.key }).from(dismissedRecurring);
  return new Set(rows.map((row) => row.key));
}

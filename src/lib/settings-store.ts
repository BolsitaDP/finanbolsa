import { eq } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";

/**
 * Escribe la fila única de ajustes, creándola si no existe.
 *
 * Esto era un `update ... where id = 'default'` en los tres sitios que escriben
 * ajustes, y un `UPDATE` sobre cero filas no da error: **cero cambios, sin
 * excepción, y el toast de éxito de todas formas**. Pasa cuando la fila no
 * existe, que era el estado de cualquier despliegue que no hubiera corrido el
 * seed de la hoja de cálculo: el usuario guardaba su moneda base, veía el
 * "guardado", y el presupuesto seguía hablando en la otra moneda. Un ajuste que
 * miente sobre sí mismo es peor que un error visible.
 *
 * La migración `0010` ya crea la fila, así que esto es la segunda mitad: que el
 * modo de fallo sea imposible aunque alguien borre la fila a mano, la restaure de
 * un respaldo viejo, o añada un cuarto sitio que escriba ajustes.
 *
 * `onConflictDoUpdate` en vez de un `UPDATE` seguido de un `INSERT` "por si
 * acaso": una sola sentencia, sin carrera entre dos, y el resultado es el mismo
 * en los dos casos.
 */
export async function saveSettings(patch: Partial<typeof settings.$inferInsert>) {
  const row = await db
    .insert(settings)
    .values({
      id: "default",
      // Valores por defecto solo se usan al crear la fila; si ya existe, el
      // `set` de abajo solo toca las columnas que se le pasaron.
      schemaVersion: "1.0",
      baseCurrency: "COP",
      startDate: new Date(),
      ...patch,
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: patch,
    })
    .returning({ id: settings.id });

  return row[0]?.id === "default";
}

/** La fila de ajustes, o `null` si todavía no existe. */
export async function readSettings() {
  const [row] = await db.select().from(settings).where(eq(settings.id, "default"));
  return row ?? null;
}

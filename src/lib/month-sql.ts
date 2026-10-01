import { sql } from "drizzle-orm";

import { transactions } from "@/db/schema";
import { monthRange } from "@/lib/month";

/**
 * `'YYYY-MM'` in LOCAL time — the same bucketing as `monthKey()`.
 *
 * Must be written in local time, not UTC, or a transaction late on the last day
 * of a month lands in the next one for SQL queries while the JS side disagrees.
 * Used for "which months have foreign-currency movements", which is what the
 * TRM refresh acts on.
 */
export const transactionMonth = sql<string>`strftime('%Y-%m', ${transactions.date}, 'unixepoch', 'localtime')`;

/**
 * `transactions.date` is `integer({ mode: "timestamp" })`, so SQLite stores unix
 * **seconds**, and better-sqlite3 refuses to bind a `Date` at all ("can only bind
 * numbers, strings, biggints, buffers, and null"). Truncating to whole seconds
 * matches how the column was written on the way in, so a transaction saved at
 * 00:00:00.400 still falls inside the month it belongs to.
 */
function unixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Filtro por mes que **sí puede usar el índice**.
 *
 * `strftime('%Y-%m', date, 'unixepoch', 'localtime') = '2026-09'` produce
 * `SCAN transactions`: SQLite no sabe invertir la función, así que lee las 50 000
 * filas aunque exista `transactions_date_idx`. Con un rango de fechas en su lugar
 * produce `SEARCH transactions USING INDEX transactions_date_idx (date>? AND
 * date<?)`, que es la razón de ser del índice.
 *
 * `monthRange()` calcula los límites en JavaScript porque la medianoche local del
 * día 1 depende de la zona horaria del proceso, que SQLite no conoce. El
 * agrupamiento por mes sigue usando `transactionMonth` —ahí la función no se puede
 * evitar y no cuesta nada—, así que el bucketing continúa siendo uno solo:
 * `monthKey()` en JS y `transactionMonth` en SQL, ambos sobre hora local.
 *
 * Un rango por mes, unidos con OR: los meses pedidos son contiguos en la práctica,
 * pero un OR de rangos indexados sigue siendo un SEARCH, y un `IN` de meses
 * calculados obligaría a un scan. En el peor caso —muchos meses no contiguos—
 * esto degrada con elegancia en vez de romperse.
 */
export function monthsInRange(months: string[]) {
  const ranges = months.map((month) => {
    const { start, end } = monthRange(month);
    return sql`(${transactions.date} >= ${unixSeconds(start)} and ${transactions.date} < ${unixSeconds(end)})`;
  });
  return sql`(${sql.join(ranges, sql` or `)})`;
}

/** El mismo filtro para un único mes, que es el caso común. */
export function monthInRange(month: string) {
  return monthsInRange([month]);
}

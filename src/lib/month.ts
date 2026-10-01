export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthStart(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/**
 * "septiembre de 2026".
 *
 * `es-CO` already returns exactly this, so it is left alone on purpose. The
 * capitalised "Septiembre De 2026" seen in the UI does NOT come from here — it
 * comes from a CSS `capitalize` on the element that renders the label, which
 * uppercases every word. Swapping the locale to "fix" it was tried and made
 * things worse: en-US returns "September 2026", i.e. the month in English. The
 * tests in __tests__/month.test.ts are what caught that regression.
 */
export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(
    monthStart(month)
  );
}

export function shiftMonth(month: string, delta: number) {
  const d = monthStart(month);
  d.setMonth(d.getMonth() + delta);
  return monthKey(d);
}

/**
 * El rango de fechas que cubre un mes, en hora local: `[start, end)`.
 *
 * Existe por una razón muy concreta: **`strftime(...) = 'YYYY-MM'` no puede usar
 * un índice.** SQLite no puede invertir la función para acotar `date`, así que
 * filtrar por mes con `strftime` obliga a `SCAN transactions` — las 50 000 filas
 * enteras — aunque `transactions_date_idx` esté ahí para justo eso. Comparar por
 * rango (`date >= ? and date < ?`) sí lo usa: `SEARCH transactions USING INDEX
 * transactions_date_idx (date>? AND date<?)`.
 *
 * Los límites se calculan aquí y no en SQL a propósito: "medianoche local del día
 * 1" depende de la zona horaria del proceso, que es información que SQLite no
 * tiene. `monthKey` y esta función son la misma definición de mes en los dos
 * lados; la única que queda en SQL es el *agrupamiento*, donde no hay alternativa
 * y donde tampoco importa el rendimiento.
 *
 * `end` es exclusivo para que dos meses consecutivos se toquen sin solaparse, y
 * para que un movimiento a medianoche caiga en el mes que le corresponde y no en
 * los dos.
 */
export function monthRange(month: string): { start: Date; end: Date } {
  const start = monthStart(month);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

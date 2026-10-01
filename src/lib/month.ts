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

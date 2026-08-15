export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthStart(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

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

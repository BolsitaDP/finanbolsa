/** Formats a Date as 'YYYY-MM-DD' for <input type="date">, in local time. */
export function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Formats a Date as 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">, in local time. */
export function toDateTimeInputValue(date: Date | null): string {
  if (!date) return "";
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${toDateInputValue(date)}T${h}:${min}`;
}

/**
 * Parses a 'YYYY-MM-DD' value from <input type="date"> as local time.
 * `new Date("YYYY-MM-DD")` parses as UTC midnight, which renders as the
 * previous day in negative-UTC-offset timezones — this avoids that.
 */
export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

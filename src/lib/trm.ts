/**
 * Fetching the official Colombian TRM (Tasa Representativa del Mercado).
 *
 * This exists because the alternative was asking the owner to type a rate every
 * month, forever. The TRM is published by the Superintendencia Financiera and
 * exposed as open data at datos.gov.co — free, no key, with full history — so
 * the app can fetch what it needs and only ask for a manual entry when someone
 * genuinely wants a different rate.
 *
 * Rates are stored as a MONTHLY AVERAGE. Valuing a month at its average is the
 * defensible choice when the goal is "what did this month cost in pesos"; a
 * closing rate would make a purchase look cheaper or dearer depending purely on
 * which day it fell. A manual entry still overrides it.
 */

const TRM_ENDPOINT = "https://www.datos.gov.co/resource/32sa-8pi3.json";

/** Only these are quoted against COP by the TRM dataset. */
export const TRM_CURRENCIES = ["USD", "EUR", "GBP", "CHF"] as const;
export type TrmCurrency = (typeof TRM_CURRENCIES)[number];

export type TrmPoint = { date: string; value: number };

/** "2026-09" -> the first instants of September and October, in UTC. */
function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
  };
}

/**
 * Daily TRM values for a month.
 *
 * Returns [] rather than throwing on network failure: a failed fetch is a
 * reason to fall back to a manual entry, not a reason to break the page.
 */
export async function fetchTrmForMonth(month: string): Promise<TrmPoint[]> {
  const { from, to } = monthRange(month);
  const where = `vigenciadesde between '${from}T00:00:00' and '${to}T00:00:00'`;
  const url =
    `${TRM_ENDPOINT}?$select=valor,vigenciadesde` +
    `&$where=${encodeURIComponent(where)}&$order=vigenciadesde&$limit=100`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { valor?: string; vigenciadesde?: string }[];
    if (!Array.isArray(body)) return [];
    return body
      .map((row) => ({
        date: (row.vigenciadesde ?? "").slice(0, 10),
        value: Number(row.valor),
      }))
      .filter((point) => point.date !== "" && Number.isFinite(point.value) && point.value > 0);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The monthly average TRM, or null when the month has no published values.
 *
 * A future month, or one the dataset has not published yet, returns null so the
 * caller can report it instead of storing something invented.
 */
export async function fetchMonthlyAverageTrm(month: string): Promise<number | null> {
  const points = await fetchTrmForMonth(month);
  if (points.length === 0) return null;
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const average = total / points.length;
  // Two decimals, matching what the source publishes: carrying more would imply
  // precision that an average of daily values does not have.
  return Math.round(average * 100) / 100;
}

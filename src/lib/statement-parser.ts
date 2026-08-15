import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

// pdfjs-dist normally spins up a Worker (or falls back to dynamically
// import()-ing the worker module by a bundler-relative path, which Next's
// server bundle can't resolve). Statically importing the worker module and
// registering it on globalThis short-circuits that lookup entirely — pdfjs
// checks globalThis.pdfjsWorker before attempting the dynamic import.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).pdfjsWorker = pdfjsWorker;

export type ParsedStatementRow = {
  date: Date;
  description: string;
  amountMinor: number;
};

const ROW_RE = /^(\d{1,2})\/(\d{1,2})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s+[\d,]+\.\d{2}$/;
const DATE_RANGE_RE = /(?:DESDE|HASTA):\s*(\d{4})\/(\d{2})\/(\d{2})/g;

/**
 * Parses a Bancolombia "ESTADO DE CUENTA" PDF into transaction rows.
 *
 * Bank statement PDFs like this lay out each column (date, description,
 * value, balance) as separate positioned text runs. Extracting the raw text
 * stream in document order interleaves columns instead of rows — so instead
 * this clusters text items by Y position (one cluster per printed row) and
 * sorts each cluster by X position, which reconstructs correct row order
 * regardless of how the PDF's content stream ordered things.
 */
export async function parseBancolombiaStatement(data: Uint8Array): Promise<ParsedStatementRow[]> {
  const doc = await getDocument({ data }).promise;

  const dateRanges: { year: number; month: number }[] = [];
  const rows: ParsedStatementRow[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    if (p === 1) {
      const fullText = content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
      for (const m of fullText.matchAll(DATE_RANGE_RE)) {
        dateRanges.push({ year: Number(m[1]), month: Number(m[2]) });
      }
    }

    const byY = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const list = byY.get(y) ?? [];
      list.push({ x, text: item.str });
      byY.set(y, list);
    }

    const sortedYs = [...byY.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const line = byY
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((i) => i.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const m = line.match(ROW_RE);
      if (!m) continue;

      const day = Number(m[1]);
      const month = Number(m[2]);
      const description = m[3].trim();
      const amountMinor = Number(m[4].replace(/,/g, ""));

      rows.push({ date: resolveYear(day, month, dateRanges), description, amountMinor });
    }
  }

  return rows;
}

/** Statements can span a year boundary (e.g. Dec–Jan); pick the year from
 * DESDE/HASTA whose month is closest to (and not after) the row's month. */
function resolveYear(
  day: number,
  month: number,
  ranges: { year: number; month: number }[]
): Date {
  let year = ranges[0]?.year ?? new Date().getFullYear();
  for (const r of ranges) {
    if (month >= r.month) year = r.year;
  }
  return new Date(year, month - 1, day);
}

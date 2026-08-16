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

const RAPPICARD_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RAPPICARD_MONEY_RE = /^\$(-?)([\d.]+),(\d{2})$/;
const RAPPICARD_ORPHAN_RE = /^\$-?[\d.]+,\d{2}$/;
const RAPPICARD_FIRST_CUOTA_RE = /^1 de \d+$/;

function parseLatinAmount(raw: string): number | null {
  const m = raw.match(RAPPICARD_MONEY_RE);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * Number(`${m[2].replace(/\./g, "")}.${m[3]}`);
}

/**
 * Parses a RappiCard (Davivienda) "Extracto de tarjeta de crédito" PDF into
 * transaction rows, one per line item in the "Detalle de transacciones" table.
 *
 * Uses the same Y-clustering approach as the Bancolombia parser, with one
 * extra wrinkle: long merchant names wrap onto their own line above/below the
 * row's numeric columns instead of staying inline, so a row's description is
 * reconstructed from neighboring single-cell text lines when it's missing
 * from the row's own line.
 *
 * Each row shows both "Valor transacción" (the full original purchase price)
 * and "Capital facturado del periodo" (only the installment actually billed
 * this period). This uses "Valor transacción" — the real amount spent — but
 * only imports a row when its "Cuotas" column reads "1 de N" (the first
 * installment, which also covers single-payment "1 de 1" purchases). Later
 * months re-list the same purchase as "2 de N", "3 de N", etc., and those are
 * skipped, so the full price is recorded exactly once, in the month the
 * purchase was made — not re-counted or spread across every statement it's
 * billed on. One consequence: a purchase whose "1 de N" row fell on a
 * statement from before the user's first import will never be recorded,
 * since by the time it's visible here it's already past cuota 1.
 */
export async function parseRappicardStatement(data: Uint8Array): Promise<ParsedStatementRow[]> {
  const doc = await getDocument({ data }).promise;
  const rows: ParsedStatementRow[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const byY = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const list = byY.get(y) ?? [];
      list.push({ x, text: item.str.trim() });
      byY.set(y, list);
    }

    const sortedYs = [...byY.keys()].sort((a, b) => b - a);
    const lines = sortedYs.map((y) => byY.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.text));

    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i];
      if (cells.length < 8) continue;
      if (cells[0] !== "Virtual" && cells[0] !== "-") continue;
      if (!RAPPICARD_DATE_RE.test(cells[1])) continue;

      // Tarjeta "-" rows are the card's own record of payments received
      // (e.g. "PAGOS POR PSE") — that money movement is already captured as
      // a transfer transaction from whichever account paid the bill, so
      // importing it again here would double-count it.
      if (cells[0] === "-") continue;

      let description: string;
      let valorStr: string;
      let cuotasStr: string;

      if (cells.length >= 9) {
        description = cells[2];
        valorStr = cells[3];
        cuotasStr = cells[5];
      } else {
        const prev = lines[i - 1];
        const next = lines[i + 1];
        const parts: string[] = [];
        if (prev && prev.length === 1 && !RAPPICARD_ORPHAN_RE.test(prev[0]) && !RAPPICARD_DATE_RE.test(prev[0])) {
          parts.push(prev[0]);
        }
        if (next && next.length === 1 && !RAPPICARD_ORPHAN_RE.test(next[0]) && !RAPPICARD_DATE_RE.test(next[0])) {
          parts.push(next[0]);
        }
        description = parts.join(" ").trim() || "(sin descripción)";
        valorStr = cells[2];
        cuotasStr = cells[4];
      }

      // Only the first installment ("1 de N") counts — later months relist
      // the same purchase as "2 de N", "3 de N"... which this excludes. This
      // also naturally excludes pre-auth holds and reversal artifacts, whose
      // Cuotas column reads "N/A" rather than a real installment number.
      if (!RAPPICARD_FIRST_CUOTA_RE.test(cuotasStr)) continue;

      const valor = parseLatinAmount(valorStr);
      if (valor === null) continue;

      const [year, month, day] = cells[1].split("-").map(Number);
      rows.push({
        date: new Date(year, month - 1, day),
        description,
        amountMinor: -valor,
      });
    }
  }

  return rows;
}

const NU_ANCHOR_DATE_RE = /^(\d{1,2})\s+([A-ZÁÉÍÓÚ]{3})(?:\s+(\d{4}))?$/i;
const NU_CUOTAS_RE = /^(\d+)\s+de\s+(\d+)$/;
const NU_CORTE_RE =
  /^\d{1,2}\s+[A-ZÁÉÍÓÚ]{3}\s+\d{4}\|(\d{1,2})\s+([A-ZÁÉÍÓÚ]{3})\s+(\d{4})\|/i;
const NU_YEAR_CONTINUATION_RE = /^\d{4}$/;
const NU_REFUND_RE = /^devoluci/i;

const NU_MONTH_ABBR: Record<string, number> = {
  ENE: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DIC: 12,
};

/**
 * Parses a Nu (Nu Colombia / Nu Financiera) "Extracto" PDF into transaction
 * rows.
 *
 * Nu lists the full outstanding installment history, not just this period's
 * activity, so the same "cuota 1 de N" convention as the RappiCard parser
 * applies: only the first installment counts, using the full "Valor" (not
 * the per-period installment amount), so a purchase's real price gets
 * recorded once, in the month it was made — not re-counted on every
 * statement it's billed on.
 *
 * Row detection is token-based rather than positional: a row only counts as
 * a purchase if one of its cells matches "N de M" (Cuotas). Rows without a
 * Cuotas column are one of two things, distinguished by description text:
 * a payment confirmation ("Gracias por tu pago" — already captured as a
 * transfer from whichever account paid the bill, so skipped here) or a
 * merchant refund ("Devolución - ..." — genuinely new information, recorded
 * as income since nothing else in the app would otherwise account for it).
 *
 * Long descriptions — and, less predictably, the date's year — can wrap onto
 * their own line below the row (occasionally two unrelated rows' wrapped
 * fragments land on the same Y line). The year isn't parsed off a row at all
 * when it wraps away; it's inferred from the statement's own "Fecha de
 * corte" instead. A wrapped description continuation is only stitched back
 * on when unambiguous: a lone text line, or one paired with a bare 4-digit
 * year (which marks it as a wrap artifact rather than a new row).
 */
export async function parseNuStatement(data: Uint8Array): Promise<ParsedStatementRow[]> {
  const doc = await getDocument({ data }).promise;
  const rows: ParsedStatementRow[] = [];
  let corteMonth: number | null = null;
  let corteYear: number | null = null;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const byY = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const list = byY.get(y) ?? [];
      list.push({ x, text: item.str.trim() });
      byY.set(y, list);
    }

    const sortedYs = [...byY.keys()].sort((a, b) => b - a);
    const lines = sortedYs.map((y) => byY.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.text));

    if (p === 1 && corteYear === null) {
      for (const cells of lines) {
        const m = cells.join("|").match(NU_CORTE_RE);
        if (!m) continue;
        corteMonth = NU_MONTH_ABBR[m[2].toUpperCase()] ?? null;
        corteYear = Number(m[3]);
        break;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i];
      if (cells.length < 3) continue;
      const dateMatch = cells[0].match(NU_ANCHOR_DATE_RE);
      if (!dateMatch) continue;

      const cuotasIdx = cells.findIndex((c) => NU_CUOTAS_RE.test(c));

      let amountMinor: number;
      if (cuotasIdx >= 1) {
        const cuotasMatch = cells[cuotasIdx].match(NU_CUOTAS_RE)!;
        if (cuotasMatch[1] !== "1") continue; // only the first installment counts
        const valor = parseLatinAmount(cells[cuotasIdx - 1]);
        if (valor === null || valor === 0) continue;
        amountMinor = -valor;
      } else if (NU_REFUND_RE.test(cells[1] ?? "")) {
        // Refund rows have the same reduced shape as a payment row (no
        // Cuotas/Valor-del-mes/Interés columns) — Valor sits right after the
        // description instead of before Cuotas.
        const valor = parseLatinAmount(cells[2] ?? "");
        if (valor === null || valor === 0) continue;
        amountMinor = valor;
      } else {
        continue; // payment confirmation or some other non-purchase row
      }

      let description = cells[1] ?? "";
      const next = lines[i + 1];
      // A lone wrapped year (no description fragment riding along) carries
      // nothing worth keeping — excluded via NU_YEAR_CONTINUATION_RE below,
      // same as the FX-commission and next-row-date exclusions.
      if (
        next &&
        next.length === 1 &&
        !next[0].startsWith("↪") &&
        !NU_ANCHOR_DATE_RE.test(next[0]) &&
        !NU_YEAR_CONTINUATION_RE.test(next[0])
      ) {
        description = `${description} ${next[0]}`.trim();
      } else if (next && next.length === 2 && NU_YEAR_CONTINUATION_RE.test(next[0])) {
        description = `${description} ${next[1]}`.trim();
      }

      const day = Number(dateMatch[1]);
      const month = NU_MONTH_ABBR[dateMatch[2].toUpperCase()];
      if (!month) continue;
      let year = dateMatch[3] ? Number(dateMatch[3]) : null;
      if (year === null) {
        year = corteYear !== null && corteMonth !== null && month > corteMonth
          ? corteYear - 1
          : (corteYear ?? new Date().getFullYear());
      }

      rows.push({
        date: new Date(year, month - 1, day),
        description,
        amountMinor,
      });
    }
  }

  return rows;
}

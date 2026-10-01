"use client";

import { useEffect, useState } from "react";
import { CopyIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { suggestFromRules } from "@/app/(app)/reglas/actions";
import { checkDuplicates } from "@/app/(app)/transacciones/actions";
import { formatMoney } from "@/lib/format";
// The canonical local-time parser, the same one the form uses on submit: an
// `&lt;input type="date">` value is local midnight, and reading it as UTC would
// shift the day and compare today's entry against tomorrow's.
import { fromDateInputValue } from "@/lib/date-input";
import type { Currency } from "@/lib/enums";
import type { DuplicateReport } from "@/lib/duplicate-check";

/**
 * "¿Las reglas dicen algo de esto?" — ROADMAP §2.4.
 *
 * The rule engine ran, but only from the rules page, in bulk, over rows already
 * saved. That is the wrong end of the loop: the moment a category is worth
 * getting right is while the transaction is being entered, and correcting it
 * afterwards is exactly the work this is meant to remove.
 *
 * **Suggested, never applied.** Two reasons, and the second is the one that
 * matters:
 *
 * 1. A category filled in without saying so is indistinguishable from one the
 *    user chose, so they have no reason to check it — and a rule pointing at the
 *    wrong category is then a silent error in six months of budget.
 * 2. The form sends `null` for both "I never picked a category" and "I chose Sin
 *    categoría", and those are different requests: leaving something
 *    uncategorised on purpose is how it reaches the weekly backlog that
 *    `/transacciones?category=none` exists to clear. Anything automatic has to
 *    guess between them, and guessing wrong does the user's work for them.
 *
 * So the suggestion is shown, with one click to take it, and nothing else
 * changes the form behind the user's back.
 */

/** How long to wait after the last keystroke. Long enough not to fire per keypress. */
const DEBOUNCE_MS = 400;

export type RuleSuggestion = {
  categoryId: string;
  categoryName: string;
  payeeId: string;
  payeeName: string;
};

export function useRuleSuggestion(input: {
  description: string;
  payeeId: string;
  accountId: string;
  amountMinor: string;
  /** False while editing an existing row: a rule has nothing to say about a correction. */
  enabled: boolean;
}): RuleSuggestion | null {
  const { description, payeeId, accountId, amountMinor, enabled } = input;

  // A rule can match on the description or the amount; with neither filled in
  // there is nothing to evaluate, and asking anyway would match every rule with
  // a loose condition. Computed during render rather than inside the effect so
  // that turning the query off is a render-time decision, not a setState — which
  // would be a cascading render.
  const queryable =
    enabled && Boolean(accountId) && (Boolean(description.trim()) || Boolean(amountMinor.trim()));

  // The result is stored against the query that produced it, and only returned
  // when the two still match. Without the key, clearing the description would
  // leave the previous chip on screen for a beat, and retyping the same text
  // would flash the old answer before the debounce resolved.
  const query = queryable
    ? JSON.stringify([description, payeeId, accountId, amountMinor])
    : null;
  const [result, setResult] = useState<{ query: string; suggestion: RuleSuggestion | null } | null>(
    null
  );

  useEffect(() => {
    if (!query) return;

    // Read back out of `query` rather than closing over the four values: the
    // serialisation IS the dependency, and taking the values from it means the
    // effect cannot read anything the dependency doesn't cover. `query` is null
    // whenever the form isn't queryable, so this also carries the "off" case.
    const [description, payeeId, accountId, amountMinor] = JSON.parse(query) as [
      string,
      string,
      string,
      string,
    ];

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const amount = Number(amountMinor);
        const res = await suggestFromRules({
          description: description.trim() || null,
          payeeId: payeeId && payeeId !== "none" ? payeeId : null,
          accountId,
          amountMinor: Number.isFinite(amount) ? amount : 0,
        });
        if (cancelled) return;
        setResult({
          query,
          suggestion:
            res.categoryId || res.payeeId
              ? {
                  categoryId: res.categoryId ?? "",
                  categoryName: res.categoryName ?? "",
                  payeeId: res.payeeId ?? "",
                  payeeName: res.payeeName ?? "",
                }
              : null,
        });
      } catch {
        // A failed suggestion must never block saving the transaction: the rules
        // are a convenience, and the form works without them.
        if (!cancelled) setResult({ query, suggestion: null });
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (!query) return null;
  return result?.query === query ? result.suggestion : null;
}

/**
 * The chip under the form fields. A component rather than inline JSX because the
 * dialog is already long and this is self-contained.
 */
export function RuleSuggestionChip({
  suggestion,
  onApply,
  busy,
}: {
  suggestion: RuleSuggestion;
  onApply: (next: { categoryId?: string; payeeId?: string }) => void;
  busy: boolean;
}) {
  const parts: string[] = [];
  if (suggestion.categoryName) parts.push(`categoría ${suggestion.categoryName}`);
  if (suggestion.payeeName) parts.push(`payee ${suggestion.payeeName}`);
  if (parts.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
      <SparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">
        Tus reglas sugieren {parts.join(" y ")}.
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() =>
          onApply({
            categoryId: suggestion.categoryId || undefined,
            payeeId: suggestion.payeeId || undefined,
          })
        }
      >
        Usar
      </Button>
    </div>
  );
}

/** How long to wait after the last keystroke. Long enough not to fire per keypress. */
const DUPLICATE_DEBOUNCE_MS = 500;

/**
 * "¿No estás agregando esto dos veces?" — ROADMAP §2.5.
 *
 * Avisa, no bloquea. Dos compras idénticas el mismo día son dos compras, y solo
 * quien está escribiendo puede saber cuál de las dos cosas es. Un formulario que
 * se negara a guardar dejaría al usuario buscando cómo saltarse la validación.
 *
 * Cada fila del aviso enlaza al movimiento que ya existe. Eso es la mitad del
 * valor: poder abrirlo y ver que es la misma compra convierte "creo que esto ya
 * está" en "ahí está, era esta", y sin eso el aviso obliga a ir a buscarla.
 */
export function useDuplicateWarning(input: {
  id?: number;
  date: string;
  amountMinor: string;
  currency: string;
  payeeId: string;
  description: string;
  enabled: boolean;
}): DuplicateReport | null {
  const { id, date, amountMinor, currency, payeeId, description, enabled } = input;

  // Sin monto no hay nada que comparar: la firma es fecha + monto, y un campo
  // vacío se parecería a un gasto de cero.
  const amount = Number(amountMinor);
  const queryable = enabled && Boolean(date) && amountMinor.trim() !== "" && Number.isFinite(amount);
  const query = queryable
    ? JSON.stringify([id, date, amountMinor, currency, payeeId, description])
    : null;

  const [result, setResult] = useState<{ query: string; report: DuplicateReport | null } | null>(null);

  useEffect(() => {
    if (!query) return;
    const [rowId, isoDate, rawAmount, cur, payee, text] = JSON.parse(query) as [
      number | undefined,
      string,
      string,
      string,
      string,
      string,
    ];

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const local = fromDateInputValue(isoDate);
        const report = await checkDuplicates({
          id: rowId,
          date: local,
          amountMinor: Number(rawAmount),
          currency: cur as Currency,
          payeeId: payee && payee !== "none" ? payee : null,
          description: text || null,
        });
        if (!cancelled) setResult({ query, report });
      } catch {
        // Un aviso que no se puede calcular no puede ser motivo para impedir
        // guardar: la transacción es válida aunque la comprobación falle.
        if (!cancelled) setResult({ query, report: null });
      }
    }, DUPLICATE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (!query) return null;
  return result?.query === query ? result.report : null;
}


export function DuplicateWarning({
  report,
  currency,
  amountMinor,
}: {
  report: DuplicateReport;
  currency: string;
  amountMinor: number;
}) {
  // La diferencia entre las dos frases es deliberada. Con una coincidencia
  // exacta se puede decir "esto ya está"; con tres probables hay que decir que se
  // parece, porque tres cafés el mismo día son tres cafés.
  const headline = report.hasExact
    ? "Ya existe un movimiento igual. ¿Lo agregaste dos veces?"
    : "Hay otros movimientos con el mismo monto este día. Puede que sean compras distintas.";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
      <div className="flex items-start gap-2">
        <CopyIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <span className="font-medium">{headline}</span>
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {report.rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/transacciones?q=${encodeURIComponent(row.payeeName ?? row.description ?? "")}`}
                  className="underline-offset-4 hover:underline"
                >
                  {row.dateLabel}
                  {row.payeeName ? ` · ${row.payeeName}` : row.description ? ` · ${row.description}` : ""}
                </Link>{" "}
                · {formatMoney(amountMinor, currency)}
              </li>
            ))}
            {report.extraCount > 0 && (
              <li>y {report.extraCount} {report.extraCount === 1 ? "movimiento más" : "movimientos más"}</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

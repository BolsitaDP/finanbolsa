import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { auditLink } from "@/lib/transactions-query";
import { buildDeltas } from "@/lib/deltas";
import type { CategoryMonthTotal } from "@/lib/aggregates";

/**
 * "¿En qué gasté más que el mes pasado?", en pesos y categoría por categoría.
 *
 * El dashboard ya tenía un delta PORCENTUAL en dos tarjetas, que responde a
 * "¿voy bien?" pero no a "¿por qué?". Un +40% no dice si fueron 20.000 o
 * 2.000.000, y un gasto nuevo aparece como un porcentaje infinito. Aquí el delta
 * es la cifra principal y el porcentaje la nota al pie, solo cuando tiene
 * sentido calcularlo.
 *
 * Server component a propósito: son cuatro números por fila, no hace falta
 * enviar JavaScript al cliente para pintar una flecha.
 */

export type CategoryDelta = {
  categoryId: string;
  currency: string;
  current: number;
  previous: number;
  delta: number;
};

/**
 * Compara dos meses y devuelve las categorías ordenadas por lo que MÁS subió.
 *
 * Toda la lógica vive en `buildDeltas` (`src/lib/deltas.ts`), compartida con la
 * tarjeta de comercios: qué entra cuando algo desaparece, y que dos monedas
 * nunca se sumen, son reglas que no pueden depender de quién llama. Esta
 * función solo decide qué clave agrupa y qué nombre lleva el campo.
 */
export function buildCategoryDeltas(
  current: CategoryMonthTotal[],
  previous: CategoryMonthTotal[],
  limit: number
): CategoryDelta[] {
  const toInput = (rows: CategoryMonthTotal[]) =>
    rows.map((row) => ({ key: row.categoryId, currency: row.currency, amountMinor: row.amountMinor }));

  return buildDeltas(toInput(current), toInput(previous), limit).map((d) => ({
    categoryId: d.key,
    currency: d.currency,
    current: d.current,
    previous: d.previous,
    delta: d.delta,
  }));
}

function DeltaPill({ delta, currency }: { delta: number; currency: string }) {
  if (delta === 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <MinusIcon className="size-3" />
        igual
      </span>
    );
  }
  // Subir gastando es malo; bajar gastando es bueno.
  const wentUp = delta > 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${wentUp ? "text-destructive" : "text-success"}`}
    >
      {wentUp ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
      {formatMoney(Math.abs(delta), currency)}
    </span>
  );
}

export function MonthOverMonthCard({
  deltas,
  categoryName,
  currentMonth,
  previousMonth,
  currentTotal,
  previousTotal,
  currency,
}: {
  deltas: CategoryDelta[];
  categoryName: Map<string, string>;
  currentMonth: string;
  previousMonth: string;
  currentTotal: number;
  previousTotal: number;
  currency: string;
}) {
  const totalDelta = currentTotal - previousTotal;

  return (
    <Card>
      <CardHeader>
        <CardTitle>¿En qué gastaste más?</CardTitle>
        <p className="text-sm text-muted-foreground">
          Este mes contra {previousMonth}, por categoría.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tracking-tight">
            {formatMoney(currentTotal, currency)}
          </span>
          <span className="text-sm text-muted-foreground">
            frente a {formatMoney(previousTotal, currency)}
          </span>
          <DeltaPill delta={totalDelta} currency={currency} />
        </div>

        {deltas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay categorías con gasto en ninguno de los dos meses.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="pb-2 font-medium">Categoría</th>
                <th className="pb-2 text-right font-medium">{currentMonth}</th>
                <th className="pb-2 text-right font-medium">{previousMonth}</th>
                <th className="pb-2 text-right font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {deltas.map((d) => {
                // El porcentaje solo tiene sentido si el mes pasado hubo algo. Con
                // gasto nuevo es una división por cero, y por eso la cifra que
                // manda aquí son los pesos.
                const percent =
                  d.previous > 0 ? `${((d.delta / d.previous) * 100).toFixed(0)}%` : null;
                return (
                  <tr key={`${d.categoryId}-${d.currency}`} className="border-t border-border/60">
                    <td className="py-2">
                      <Link href={`/categorias/${d.categoryId}`} className="hover:underline">
                        <Badge variant="outline" className="max-w-full truncate">
                          {categoryName.get(d.categoryId) ?? d.categoryId}
                        </Badge>
                      </Link>
                    </td>
                    {/* Both columns link: the whole point of the card is that
                        a delta is only believable if you can see both sides. */}
                    <td className="py-2 text-right tabular-nums">
                      <Link
                        href={auditLink({ category: d.categoryId, month: currentMonth, type: "expense" })}
                        title={`Ver los movimientos de ${categoryName.get(d.categoryId) ?? d.categoryId} en ${currentMonth}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {formatMoney(d.current, d.currency)}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      <Link
                        href={auditLink({ category: d.categoryId, month: previousMonth, type: "expense" })}
                        title={`Ver los movimientos de ${categoryName.get(d.categoryId) ?? d.categoryId} en ${previousMonth}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {formatMoney(d.previous, d.currency)}
                      </Link>
                    </td>
                    <td className="py-2 text-right">
                      <span className="flex items-center justify-end gap-2">
                        {percent ? (
                          <span className="text-xs text-muted-foreground">{percent}</span>
                        ) : null}
                        <DeltaPill delta={d.delta} currency={d.currency} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

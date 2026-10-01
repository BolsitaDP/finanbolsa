import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { auditLink } from "@/lib/transactions-query";
import { buildDeltas } from "@/lib/deltas";
import type { PayeeMonthTotal } from "@/lib/aggregates";

/**
 * "¿A quién le gasté más?" — ROADMAP §1.6.
 *
 * El ranking por categoría ya decía en qué se fue la plata; este dice a quién se
 * la fue. La pregunta es distinta y la respuesta también: un gasto puede estar
 * en "restaurantes" durante seis meses y ser siempre el mismo restaurante, y
 * saberlo es lo que permite decidir algo —cancelar, dejar de ir, cambiar de
 * plan— en vez de solo notar que el número creció.
 *
 * Server component, como las otras tarjetas del dashboard: cinco filas de texto.
 */

export type PayeeDelta = {
  payeeId: string;
  currency: string;
  current: number;
  previous: number;
  delta: number;
};

/**
 * La misma comparación mes contra mes, agrupada por comercio.
 *
 * Envuelve `buildDeltas` en vez de repetirlo: qué entra cuando un comercio
 * desaparece del mes, y que dos monedas nunca se sumen, son las mismas dos
 * decisiones que la tarjeta de categorías ya tuvo que tomar bien.
 */
export function buildPayeeDeltas(
  current: PayeeMonthTotal[],
  previous: PayeeMonthTotal[],
  limit: number
): PayeeDelta[] {
  const toInput = (rows: PayeeMonthTotal[]) =>
    rows.map((row) => ({ key: row.payeeId, currency: row.currency, amountMinor: row.amountMinor }));

  return buildDeltas(toInput(current), toInput(previous), limit).map((d) => ({
    payeeId: d.key,
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

export function TopPayeesCard({
  deltas,
  payeeName,
  currency,
  currentMonth,
  previousMonth,
}: {
  deltas: PayeeDelta[];
  payeeName: Map<string, string>;
  currency: string;
  currentMonth: string;
  previousMonth: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tus comercios principales este mes ({currency})</CardTitle>
        <p className="text-sm text-muted-foreground">
          Los {deltas.length} con más gasto, contra {previousMonth}.
        </p>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="pb-2 font-medium">Comercio</th>
              <th className="pb-2 text-right font-medium">{currentMonth}</th>
              <th className="pb-2 text-right font-medium">{previousMonth}</th>
              <th className="pb-2 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {deltas.map((d) => {
              const name = payeeName.get(d.payeeId) ?? d.payeeId;
              // Un comercio nuevo no tiene con qué compararse, así que el
              // porcentaje se omite en vez de inventarse.
              const percent = d.previous > 0 ? `${((d.delta / d.previous) * 100).toFixed(0)}%` : null;
              return (
                <tr key={`${d.payeeId}-${d.currency}`} className="border-t border-border/60">
                  <td className="py-2">
                    <Link href={`/payees/${d.payeeId}`} className="hover:underline">
                      {name}
                    </Link>
                  </td>
                  {/* Los dos lados enlazan: el total de un comercio es tan opaco
                      como el de una categoría ahora que se calcula en SQL. */}
                  <td className="py-2 text-right tabular-nums">
                    <Link
                      href={auditLink({ payee: d.payeeId, month: currentMonth, type: "expense" })}
                      title={`Ver los movimientos de ${name} en ${currentMonth}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {formatMoney(d.current, d.currency)}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    <Link
                      href={auditLink({ payee: d.payeeId, month: previousMonth, type: "expense" })}
                      title={`Ver los movimientos de ${name} en ${previousMonth}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {formatMoney(d.previous, d.currency)}
                    </Link>
                  </td>
                  <td className="py-2 text-right">
                    <span className="flex items-center justify-end gap-2">
                      {percent ? <span className="text-xs text-muted-foreground">{percent}</span> : null}
                      <DeltaPill delta={d.delta} currency={d.currency} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

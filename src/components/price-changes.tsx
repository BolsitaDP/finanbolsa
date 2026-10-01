import Link from "next/link";
import { ArrowUpIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { PriceChange, RecurringGroup } from "@/lib/recurring";

/**
 * "Netflix subió de $35.000 a $42.000" — ROADMAP §1.4.
 *
 * El precio de una suscripción es el único número de esta app que puede moverse
 * sin que nada en la base de datos cambie de aspecto: el movimiento sigue
 * pareciendo un movimiento más, y el promedio mensual se lo come. Es el número
 * que más duele y el más fácil de no ver.
 *
 * Server component a propósito, como la tarjeta de comparación mes a mes: son
 * cuatro números por fila y no hay nada que interactuar.
 */

type PricedGroup = RecurringGroup & { priceChange: PriceChange };

/**
 * Los incrementos van agrupados por moneda y ordenados por monto DENTRO de cada
 * moneda. Rankearlos todos juntos exigiría comparar pesos con dólares, que es la
 * misma suma sin tasa que hacía que el presupuesto mintiera en silencio
 * (ROADMAP §0.7b): el orden dejaría de significar algo.
 */
function byCurrency(groups: PricedGroup[]): [string, PricedGroup[]][] {
  const buckets = new Map<string, PricedGroup[]>();
  for (const group of groups) {
    const list = buckets.get(group.currency) ?? [];
    list.push(group);
    buckets.set(group.currency, list);
  }
  return [...buckets.entries()].map(([currency, list]) => [
    currency,
    // Lo que más dolió arriba, que es lo que uno busca al abrir la página.
    list.sort((a, b) => b.priceChange.deltaMinor - a.priceChange.deltaMinor),
  ]);
}

/**
 * El porcentaje es la nota al pie; los pesos son la respuesta. Sin base previa
 * no hay porcentaje que calcular, y "Infinity%" no es una respuesta: un plan que
 * pasa de gratis a de pago se dice con palabras.
 */
function percentLabel(change: PriceChange) {
  return change.ratio === null ? null : `+${Math.round((change.ratio - 1) * 100)}%`;
}

export function PriceChangeBadge({ change }: { change: PriceChange }) {
  const percent = percentLabel(change);
  return (
    <Badge variant="destructive">
      <ArrowUpIcon data-icon="inline-start" />
      {percent ?? "subió"}
    </Badge>
  );
}

export function PriceChangesCard({ groups }: { groups: RecurringGroup[] }) {
  const increased = groups.filter((g): g is PricedGroup => g.priceChange !== null);

  // Se omite entera cuando no hay nada: una tarjeta permanente que dice "aquí no
  // ocurre nada" entrena al usuario a no mirarla, y el día que sí importa ya no
  // la lee.
  if (increased.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Suscripciones que subieron de precio</CardTitle>
        <p className="text-sm text-muted-foreground">
          El último cargo de estas cuentas es más caro que los anteriores.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {byCurrency(increased).map(([currency, list]) => (
          <div key={currency} className="flex flex-col gap-2">
            {increased.length > 1 && (
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {currency}
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {list.map((group) => {
                const change = group.priceChange;
                // Solo un grupo con payee tiene ficha. Los agrupados por
                // descripción no tienen a quién abrirle, y un enlace a
                // /payees/desc:spotify sería un 404.
                const payeeId = group.key.startsWith("payee:") ? group.key.slice(6) : null;
                return (
                  <li
                    key={group.key}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                  >
                    {payeeId ? (
                      <Link href={`/payees/${payeeId}`} className="hover:underline">
                        <span className="text-sm font-medium">{group.label}</span>
                      </Link>
                    ) : (
                      <span className="text-sm font-medium">{group.label}</span>
                    )}
                    <span className="flex flex-wrap items-baseline gap-2 text-sm tabular-nums">
                      <span className="text-muted-foreground">
                        {formatMoney(change.previousAverageMinor, currency)}
                      </span>
                      <span aria-hidden>→</span>
                      <span className="font-medium">
                        {formatMoney(change.latestAmountMinor, currency)}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-destructive">
                        <ArrowUpIcon className="size-3" />
                        {formatMoney(change.deltaMinor, currency)}
                      </span>
                      <PriceChangeBadge change={change} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

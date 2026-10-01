import { CalendarClockIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import type { Projection } from "@/lib/recurring-projection";

/**
 * "Gastos previstos ≈ $340.000" — ROADMAP §1.5.
 *
 * La pregunta que uno se hace al abrir la app a principios de mes. La lista de
 * `/recurrentes` ya sabe qué cargos se repiten; aquí se cuenta solo los que caen
 * dentro de la ventana, que no es lo mismo: una suscripción cancelada hace meses
 * sigue en el informe y no en la previsión.
 *
 * Va en esta página y no en el dashboard a propósito, por dos razones. La
 * detectable son los recurrentes, y aquí ya se acaban de calcular: en el inicio
 * serían una consulta más sobre toda la tabla de gastos para responder una
 * pregunta que es de detalle. Y el informe y su previsión juntos se leen de un
 * vistazo, que es el punto — el ROADMAP lo pedía como "convierte /recurrentes de
 * un listado en un pronóstico".
 *
 * Server component. Se muestra aunque el total sea 0 si hubo cargos ya previstos:
 * "esta semana no sale nada" también es una respuesta, y una tarjeta que solo
 * existe cuando hay dinero que gastar obliga a abrir `/recurrentes` para saber si
 * no hay nada.
 */

function daysAwayLabel(daysAway: number) {
  if (daysAway === 0) return "hoy";
  if (daysAway === 1) return "mañana";
  return `en ${daysAway} días`;
}

export function UpcomingChargesCard({ projections }: { projections: Projection[] }) {
  if (projections.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClockIcon className="size-4" />
          Gastos previstos
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Lo que ya se sabe que se va a cobrar en los próximos 30 días, según los cargos que se
          repiten. No incluye lo que todavía no ha pasado.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {projections.map((projection) => (
          <div key={projection.currency} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight">
                {formatMoney(projection.totalMinor, projection.currency)}
              </span>
              <span className="text-sm text-muted-foreground">
                en {projection.charges.length}{" "}
                {projection.charges.length === 1 ? "cargo" : "cargos"}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {projection.charges.map((charge) => (
                <li
                  key={charge.key}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                >
                  <span className="font-medium">{charge.label}</span>
                  <span className="flex items-baseline gap-2 tabular-nums">
                    <span className="text-muted-foreground">
                      {formatDate(charge.expectedDate)} · {daysAwayLabel(charge.daysAway)}
                    </span>
                    <span className="w-24 text-right font-medium">
                      {formatMoney(charge.amountMinor, projection.currency)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

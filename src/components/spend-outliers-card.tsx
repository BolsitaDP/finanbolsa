import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { auditLink } from "@/lib/transactions-query";
import type { SpendOutlier } from "@/lib/spend-outliers";

/**
 * "¿Algo se te está yendo de las manos?" — ROADMAP §1.3.
 *
 * La tarjeta de al lado compara este mes contra el anterior, que responde
 * "¿subió?" pero no "¿esto es normal?". Una categoría que lleva seis meses en
 * 200.000 y va en 650.000 no es un aumento: es una fuga, y es la que se detecta
 * antes de que se vuelva un agujero el mes que viene.
 *
 * Deliberadamente una sola señal, y deliberadamente callada la mayor parte del
 * tiempo. Una tarjeta de alertas que siempre tiene algo que avisar es una tarjeta
 * que se deja de mirar, y el día que importa no se lee. Server component: son
 * tres filas.
 */

function ratioLabel(ratio: number) {
  return `${ratio.toFixed(1).replace(".", ",")}×`;
}

export function SpendOutliersCard({
  outliers,
  categoryName,
  currentMonth,
}: {
  outliers: SpendOutlier[];
  categoryName: Map<string, string>;
  currentMonth: string;
}) {
  if (outliers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TriangleAlertIcon className="size-4 text-destructive" />
          Gasto fuera de lo normal
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Categorías que van muy por encima de su propio promedio de los últimos 6 meses, ya
          ajustado a la parte del mes que ha transcurrido.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {outliers.map((o) => {
          const name = categoryName.get(o.categoryId) ?? o.categoryId;
          return (
            <div
              key={`${o.categoryId}-${o.currency}`}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
            >
              <Link href={`/categorias/${o.categoryId}`} className="hover:underline">
                <span className="text-sm font-medium">{name}</span>
              </Link>
              <span className="flex flex-wrap items-baseline gap-2 text-sm tabular-nums">
                <span className="text-muted-foreground">
                  {ratioLabel(o.ratio)} lo normal
                </span>
                {/* El enlace va a los movimientos de ESTE mes, que es el
                    período contra el que se comparó la base. Enlazar al
                    histórico de la categoría abriría una lista que no contiene
                    el gasto que disparó la alerta. */}
                <Link
                  href={auditLink({ category: o.categoryId, month: currentMonth, type: "expense" })}
                  title={`Ver los movimientos de ${name} en ${currentMonth}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {formatMoney(o.current, o.currency)}
                </Link>
                <Badge variant="destructive">
                  vs {formatMoney(o.baseline, o.currency)} de promedio
                </Badge>
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

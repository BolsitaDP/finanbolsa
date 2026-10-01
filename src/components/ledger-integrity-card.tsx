import Link from "next/link";
import { ShieldAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { auditLink } from "@/lib/transactions-query";
import type {
  BeforeReferenceFinding,
  OversplitFinding,
} from "@/lib/ledger-integrity";

/**
 * "Estos números no cuadran" — ROADMAP §3.
 *
 * Todo saldo de esta app es derivado: el saldo de referencia de la cuenta más
 * los movimientos posteriores. Eso hace que los saldos sean rápidos y no
 * necesiten snapshots, y también que **un error en los datos no se muestre como
 * error**: produce un número y nada más.
 *
 * Esta tarjeta es el control que faltaba. No arregla nada —señala dónde mirar— y
 * por diseño no aparece cuando todo está bien: una tarjeta de salud permanente
 * en el inicio es ruido, y el día que importa tiene que ser la primera que se ve.
 *
 * Server component. Solo se renderiza si hay algo que reportar.
 */

export function LedgerIntegrityCard({
  beforeReference,
  oversplits,
}: {
  beforeReference: BeforeReferenceFinding[];
  oversplits: OversplitFinding[];
}) {
  if (beforeReference.length === 0 && oversplits.length === 0) return null;

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlertIcon className="size-4 text-destructive" />
          Hay números que no cuadran
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          La app derivada los saldos a partir de los movimientos, así que un dato inconsistente no
          da error: da un saldo que no es el real. Esto es lo que encontró la revisión.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {beforeReference.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              Movimientos anteriores al saldo de referencia de su cuenta
            </h3>
            <p className="text-sm text-muted-foreground">
              Entran en todas las estadísticas de gasto, pero <strong>no</strong> suman al saldo:
              el saldo de partida ya los incluye. Pasa al importar un extracto de un periodo
              anterior, o al mover la fecha de referencia de una cuenta a una más reciente.
            </p>
            <ul className="flex flex-col gap-2">
              {beforeReference.map((finding) => (
                <li
                  key={finding.accountId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"
                >
                  <span className="font-medium">{finding.accountName}</span>
                  <span className="flex flex-wrap items-baseline gap-2 tabular-nums">
                    <Badge variant="outline">
                      referencia {formatDate(finding.referenceDate)}
                    </Badge>
                    <Link
                      href={`/transacciones?account=${finding.accountId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {finding.count}{" "}
                      {finding.count === 1 ? "movimiento" : "movimientos"}
                    </Link>
                    {Object.entries(finding.totalsByCurrency).map(([currency, total]) => (
                      <span key={currency} className="text-muted-foreground">
                        {formatMoney(total, currency)}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              La forma de arreglarlo es mover el saldo de referencia de la cuenta a una fecha
              anterior a esos movimientos, o ajustarlo para que el saldo real sea el de hoy. Ambas
              cosas se hacen en la ficha de la cuenta.
            </p>
          </section>
        )}

        {oversplits.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Desgloses que atribuyen más plata de la que salió</h3>
            <p className="text-sm text-muted-foreground">
              Un desglose mueve dinero entre categorías, no lo crea. Estas filas reparten más de
              lo que las contiene, así que el gasto por categoría y el presupuesto salen
              inflados. Ya no se pueden crear, pero estas son anteriores al arreglo.
            </p>
            <ul className="flex flex-col gap-2">
              {oversplits.map((finding) => (
                <li
                  key={finding.transactionId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"
                >
                  {/* Al mes del movimiento, no a la lista entera: la app no tiene
                      página de detalle de una transacción, y un enlace a
                      "/transacciones" sin filtro no lleva a ningún sitio desde
                      donde se pueda corregir. */}
                  <Link
                    href={auditLink({ month: finding.month, type: "expense" })}
                    title={
                      finding.description
                        ? `Ver los gastos de ${finding.month} para encontrar el movimiento #${finding.transactionId}`
                        : `Ver los gastos de ${finding.month}`
                    }
                    className="underline-offset-4 hover:underline"
                  >
                    {finding.description ?? `Movimiento #${finding.transactionId}`}
                  </Link>
                  <span className="flex items-baseline gap-2 tabular-nums">
                    <span className="text-muted-foreground">
                      desglose {formatMoney(finding.splitTotal, finding.currency)} sobre{" "}
                      {formatMoney(Math.abs(finding.parentAmount), finding.currency)}
                    </span>
                    <Badge variant="destructive">
                      +{formatMoney(finding.excessMinor, finding.currency)}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { db } from "@/db";
import { categories, payees } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PriceChangeBadge, PriceChangesCard } from "@/components/price-changes";
import { UpcomingChargesCard } from "@/components/upcoming-charges-card";
import { recurringCandidates } from "@/lib/aggregates";
import { detectRecurring, payeeIdFromGroupKey, recurringGroupKey } from "@/lib/recurring";
import { projectUpcoming } from "@/lib/recurring-projection";
import {
  planChargeForMonth,
  recordedSignature,
  toRecurringTemplate,
} from "@/lib/recurring-template";
import { isStillCharging, monthsSinceLastCharge } from "@/lib/recurring-projection";
import { getDismissedRecurring } from "./actions";
import { monthKey } from "@/lib/month";
import { formatDate, formatMoney } from "@/lib/format";
import { RecurringChargeButton } from "@/components/recurring-charge-button";
import {
  DismissRecurringButton,
  RestoreDismissedButton,
} from "@/components/dismiss-recurring-button";

// Reads live data with no dynamic API to force Next to treat it as such —
// see the comment in src/app/configuracion/page.tsx for why this matters.
export const dynamic = "force-dynamic";

export default async function RecurrentesPage() {
  // Detection reads eight of a transaction's nineteen columns, and ignores any
  // row that is not an expense or has neither a payee nor a description. Letting
  // SQLite drop those rows and columns is most of this page's cost.
  const [candidates, allPayees, allCategories, dismissed] = await Promise.all([
    recurringCandidates(),
    db.select().from(payees),
    db.select().from(categories),
    getDismissedRecurring(),
  ]);

  const payeeName = new Map(allPayees.map((p) => [p.id, p.name]));
  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));

  // Lo que el usuario ya dijo que no es una suscripción sale de la lista
  // entera, no se marca tachado. Un grupo descartado entre los activos se lee
  // como "este sigue aquí y hay algo raro con él", que es lo contrario de lo que
  // se pidió.
  const allRecurring = detectRecurring(candidates, payeeName);
  const recurring = allRecurring.filter((group) => !dismissed.has(group.key));

  // Firmas de lo ya registrado este mes, para que el botón "registrar" no
  // ofrezca crear un cargo que el usuario acaba de capturar a mano. Solo se leen
  // el mes en curso y el nombre del grupo, y salen de los mismos candidatos que
  // ya se trajo para la detección.
  const today = new Date();
  const currentMonth = monthKey(today);
  const recordedThisMonth = new Set(
    candidates
      .filter((tx) => monthKey(tx.date) === currentMonth)
      .flatMap((tx) => {
        const key = recurringGroupKey(tx);
        return key ? [recordedSignature(tx.date, tx.amountMinor, key)] : [];
      })
  );

  const monthlyByCurrency = new Map<string, number>();
  for (const r of recurring) {
    monthlyByCurrency.set(r.currency, (monthlyByCurrency.get(r.currency) ?? 0) + r.averageAmountMinor);
  }

  // De informe a pronóstico: los mismos cargos recurrentes, contados solo si
  // caen dentro de la ventana. Sale de lo que ya está calculado arriba, así que
  // no cuesta una consulta.
  const projections = projectUpcoming(recurring, today);

  // Los descartes ya no están en `recurring`, así que su etiqueta hay que
  // recuperarla de la lista sin filtrar: el conjunto de claves solo tiene el id.
  const labelByKey = new Map(allRecurring.map((g) => [g.key, g.label]));
  const dismissedLabels = [...dismissed].map((key) => labelByKey.get(key) ?? key);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Recurrentes</h1>
        <p className="text-sm text-muted-foreground">
          Gastos que se repiten mes a mes con un monto similar — suscripciones, membresías y
          demás. Se detectan a partir del historial: un payee o descripción que aparece en al
          menos 3 meses distintos con montos parecidos.
        </p>
      </div>

      {monthlyByCurrency.size > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...monthlyByCurrency.entries()].map(([currency, total]) => (
            <Card key={currency}>
              <CardHeader>
                <CardTitle className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Recurrente mensual estimado ({currency})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-semibold tracking-tight">{formatMoney(total, currency)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PriceChangesCard groups={recurring} />

      <UpcomingChargesCard projections={projections} />

      <Card>
        <CardHeader>
          <CardTitle>{recurring.length} gastos recurrentes detectados</CardTitle>
        </CardHeader>
        <CardContent>
          {recurring.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay suficiente historial para detectar recurrentes (se necesitan al menos
              3 meses con un cargo parecido).
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Promedio mensual</TableHead>
                  <TableHead className="text-right">Meses vistos</TableHead>
                  <TableHead>Última vez</TableHead>
                  <TableHead className="text-right">Total gastado</TableHead>
                  <TableHead>Último cambio</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recurring.map((r) => {
                  const monthsAgo = monthsSinceLastCharge(r.lastDate, today);
                  const isActive = isStillCharging(r.lastDate, today, r.medianIntervalDays);
                  const plan = planChargeForMonth(
                    toRecurringTemplate(r, payeeIdFromGroupKey),
                    today,
                    recordedThisMonth
                  );
                  return (
                  <TableRow key={r.key} className={isActive ? undefined : "text-muted-foreground"}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col items-start gap-1">
                        <span>{r.label}</span>
                        {/* "No aparece desde hace N meses" es la señal que
                            `categorias/[id]` ya daba para las categorías y que
                            faltaba aquí. Sin ella, una suscripción cancelada hace
                            ocho meses sigue en la lista con el mismo aspecto que
                            una que se cobra el viernes. */}
                        {!isActive && (
                          <span className="text-xs text-muted-foreground">
                            No aparece desde hace {monthsAgo}{" "}
                            {monthsAgo === 1 ? "mes" : "meses"}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.categoryId ? (
                        <Link href={`/categorias/${r.categoryId}`}>
                          <Badge variant="outline">{categoryName.get(r.categoryId) ?? r.categoryId}</Badge>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(r.averageAmountMinor, r.currency)}
                    </TableCell>
                    <TableCell className="text-right">{r.monthsSeen}</TableCell>
                    <TableCell>{formatDate(r.lastDate)}</TableCell>
                    <TableCell className="text-right">
                      {formatMoney(r.totalAmountMinor, r.currency)}
                    </TableCell>
                    <TableCell>
                      {plan.kind === "ready" ? (
                        <RecurringChargeButton charge={plan.charge} />
                      ) : r.priceChange ? (
                        // El tooltip lleva los dos montos: el badge solo tiene
                        // espacio para el porcentaje, y el porcentaje sin el
                        // "de cuánto a cuánto" no dice nada.
                        <span
                          title={`${formatMoney(r.priceChange.previousAverageMinor, r.currency)} → ${formatMoney(r.priceChange.latestAmountMinor, r.currency)}`}
                        >
                          <PriceChangeBadge change={r.priceChange} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DismissRecurringButton groupKey={r.key} label={r.label} />
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dismissedLabels.length > 0 && (
        <RestoreDismissedButton keys={[...dismissed]} labels={dismissedLabels} />
      )}
    </div>
  );
}

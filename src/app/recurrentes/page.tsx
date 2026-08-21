import Link from "next/link";
import { isNull } from "drizzle-orm";

import { db } from "@/db";
import { categories, payees, transactions } from "@/db/schema";
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
import { detectRecurring } from "@/lib/recurring";
import { formatDate, formatMoney } from "@/lib/format";

export default async function RecurrentesPage() {
  const [allTransactions, allPayees, allCategories] = await Promise.all([
    db.select().from(transactions).where(isNull(transactions.deletedAt)),
    db.select().from(payees),
    db.select().from(categories),
  ]);

  const payeeName = new Map(allPayees.map((p) => [p.id, p.name]));
  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));

  const recurring = detectRecurring(allTransactions, payeeName);

  const monthlyByCurrency = new Map<string, number>();
  for (const r of recurring) {
    monthlyByCurrency.set(r.currency, (monthlyByCurrency.get(r.currency) ?? 0) + r.averageAmountMinor);
  }

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {recurring.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.label}</TableCell>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

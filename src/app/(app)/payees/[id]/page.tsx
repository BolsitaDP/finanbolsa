import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ArrowLeftIcon, PencilIcon, XIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, categories, payees, transactions, transactionSplits } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayeeFormDialog } from "@/components/payee-form-dialog";
import { MonthlyTrendChart } from "@/components/monthly-trend-chart";
import { TransaccionesTable } from "@/components/transacciones-table";
import { CHART_COLORS } from "@/components/net-worth-chart";
import { monthlyAmounts, monthKey } from "@/lib/spending-stats";
import { monthLabel } from "@/lib/month";
import { groupSplitsByTransaction, buildAllocations } from "@/lib/splits";
import { formatMoney } from "@/lib/format";
import { MonthSwitcher } from "@/components/month-switcher";
import { getAllProjectNames } from "@/app/(app)/proyectos/actions";

export default async function PayeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month } = await searchParams;

  const [allCategories, allAccounts, allPayees, payeeTx, allSplits, projectNames] = await Promise.all([
    db.select().from(categories),
    db.select().from(accounts),
    db.select().from(payees),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.payeeId, id), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.date)),
    db.select().from(transactionSplits),
    getAllProjectNames(),
  ]);

  const payee = allPayees.find((p) => p.id === id);
  if (!payee) notFound();

  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const defaultCategoryName = payee.defaultCategoryId ? categoryName.get(payee.defaultCategoryId) : null;

  const splitsByTx = groupSplitsByTransaction(allSplits);
  // Splits from OTHER transactions (e.g. a cash withdrawal) specifically
  // allocated to this payee.
  const splitsIntoThisPayee = allSplits.filter((s) => s.payeeId === id);
  const splitParentIds = [...new Set(splitsIntoThisPayee.map((s) => s.transactionId))];
  const splitParentTx =
    splitParentIds.length > 0
      ? await db.select().from(transactions).where(inArray(transactions.id, splitParentIds))
      : [];
  const splitParentById = new Map(splitParentTx.map((t) => [t.id, t]));

  const allocations = buildAllocations(payeeTx, splitsByTx, splitsIntoThisPayee, splitParentById);

  const currencies = [...new Set(allocations.map((a) => a.currency))];
  const totalsByCurrency = new Map<string, number>();
  for (const a of allocations) {
    totalsByCurrency.set(a.currency, (totalsByCurrency.get(a.currency) ?? 0) + a.amountMinor);
  }

  const categoryTotals = new Map<string, number>();
  for (const a of allocations) {
    if (!a.categoryId) continue;
    categoryTotals.set(a.categoryId, (categoryTotals.get(a.categoryId) ?? 0) + a.amountMinor);
  }
  const topCategories = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([categoryId, amountMinor]) => ({ categoryId, amountMinor }));

  const filteredPayeeTx = month ? payeeTx.filter((t) => monthKey(t.date) === month) : payeeTx;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            nativeButton={false}
            render={<Link href="/payees" />}
          >
            <ArrowLeftIcon /> Payees
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{payee.name}</h1>
            {defaultCategoryName && payee.defaultCategoryId && (
              <Link href={`/categorias/${payee.defaultCategoryId}`}>
                <Badge variant="outline">{defaultCategoryName}</Badge>
              </Link>
            )}
          </div>
          {payee.notes && <p className="text-sm text-muted-foreground">{payee.notes}</p>}
        </div>
        <PayeeFormDialog
          categories={allCategories}
          payee={payee}
          trigger={
            <Button variant="outline" size="sm">
              <PencilIcon /> Editar
            </Button>
          }
        />
      </div>

      {currencies.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-xl border bg-card px-5 py-4">
          {currencies.map((currency) => (
            <div key={currency} className="flex items-baseline gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Total {currency}
              </span>
              <span className="text-2xl font-semibold tracking-tight">
                {formatMoney(totalsByCurrency.get(currency) ?? 0, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {currencies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tendencia mensual</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {currencies.map((currency, i) => (
              <div key={currency} className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">{currency}</span>
                <MonthlyTrendChart
                  data={monthlyAmounts(
                    allocations.filter((a) => a.currency === currency),
                    12
                  )}
                  currency={currency}
                  color={CHART_COLORS[i % CHART_COLORS.length]}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{filteredPayeeTx.length} transacciones</CardTitle>
            <MonthSwitcher month={month ?? monthKey(new Date())} />
          {month && (
              <Link
                href={`/payees/${id}`}
                className="flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Filtrado por {monthLabel(month)} <XIcon className="size-3" />
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredPayeeTx.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {month
                ? "No hay transacciones de este payee en ese mes."
                : "Todavía no hay transacciones con este payee."}
            </p>
          ) : (
            <TransaccionesTable
              transactions={filteredPayeeTx}
              accounts={allAccounts}
              categories={allCategories}
              payees={allPayees}
              projectNames={projectNames}
              splitsByTx={splitsByTx}
            />
          )}
        </CardContent>
      </Card>

      {topCategories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Categorías principales</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCategories.map((c) => (
                  <TableRow key={c.categoryId}>
                    <TableCell className="font-medium">
                      <Link href={`/categorias/${c.categoryId}`} className="hover:underline">
                        {categoryName.get(c.categoryId) ?? c.categoryId}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(c.amountMinor, currencies[0] ?? "COP")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

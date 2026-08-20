import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ArrowLeftIcon, PencilIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, budgets, categories, payees, transactions, transactionSplits } from "@/db/schema";
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
import { CategoryFormDialog } from "@/components/category-form-dialog";
import { CategoryArchiveSuggestion } from "@/components/category-archive-suggestion";
import { CategoryTrendChart } from "@/components/category-trend-chart";
import { TransaccionesTable } from "@/components/transacciones-table";
import { CHART_COLORS } from "@/components/net-worth-chart";
import { monthlyAmounts, monthKey } from "@/lib/spending-stats";
import { groupSplitsByTransaction } from "@/lib/splits";
import { formatDate, formatMoney } from "@/lib/format";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [allCategories, allAccounts, allPayees, categoryTx, categoryBudgets, allSplits] = await Promise.all([
    db.select().from(categories),
    db.select().from(accounts),
    db.select().from(payees),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.categoryId, id), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.date)),
    db.select().from(budgets).where(eq(budgets.categoryId, id)).orderBy(desc(budgets.month)),
    db.select().from(transactionSplits),
  ]);

  const category = allCategories.find((c) => c.id === id);
  if (!category) notFound();

  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const payeeName = new Map(allPayees.map((p) => [p.id, p.name]));
  const parentName = category.parentCategoryId ? categoryName.get(category.parentCategoryId) : null;
  const children = allCategories.filter((c) => c.parentCategoryId === id);

  const splitsByTx = groupSplitsByTransaction(allSplits);
  // Splits from OTHER transactions (e.g. a cash withdrawal tagged "Efectivo")
  // that got specifically broken down into this category.
  const splitsIntoThisCategory = allSplits.filter((s) => s.categoryId === id);
  const splitParentIds = [...new Set(splitsIntoThisCategory.map((s) => s.transactionId))];
  const splitParentTx =
    splitParentIds.length > 0
      ? await db.select().from(transactions).where(inArray(transactions.id, splitParentIds))
      : [];
  const splitParentById = new Map(splitParentTx.map((t) => [t.id, t]));

  // Unified spend attribution for this category: each directly-tagged
  // transaction contributes whatever it hasn't split away to another
  // category (its full amount when it has no splits — same as before), plus
  // whatever other transactions' splits specifically allocated here.
  type Allocation = {
    date: Date;
    currency: string;
    amountMinor: number;
    payeeId: string | null;
  };
  const allocations: Allocation[] = [];
  for (const t of categoryTx) {
    const splits = splitsByTx.get(t.id) ?? [];
    const remainder = t.amountMinor - splits.reduce((s, sp) => s + sp.amountMinor, 0);
    if (remainder > 0) {
      allocations.push({ date: t.date, currency: t.currency, amountMinor: remainder, payeeId: t.payeeId });
    }
  }
  for (const s of splitsIntoThisCategory) {
    const parent = splitParentById.get(s.transactionId);
    if (!parent) continue;
    allocations.push({ date: parent.date, currency: parent.currency, amountMinor: s.amountMinor, payeeId: s.payeeId });
  }

  const currencies = [...new Set(allocations.map((a) => a.currency))];
  const totalsByCurrency = new Map<string, number>();
  for (const a of allocations) {
    totalsByCurrency.set(a.currency, (totalsByCurrency.get(a.currency) ?? 0) + a.amountMinor);
  }

  const monthsActive = new Set(allocations.map((a) => monthKey(a.date))).size;
  const lastAlloc = [...allocations].sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null;

  // Only flag categories that have actually seen activity before — a
  // brand-new empty category isn't "unused," it just hasn't been used yet.
  const now = new Date();
  const monthsSinceLastTx = lastAlloc
    ? (now.getFullYear() - lastAlloc.date.getFullYear()) * 12 + (now.getMonth() - lastAlloc.date.getMonth())
    : null;
  const isUnused = category.status === "active" && monthsSinceLastTx !== null && monthsSinceLastTx >= 6;

  const payeeTotals = new Map<string, number>();
  for (const a of allocations) {
    if (!a.payeeId) continue;
    payeeTotals.set(a.payeeId, (payeeTotals.get(a.payeeId) ?? 0) + a.amountMinor);
  }
  const topPayees = [...payeeTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([payeeId, amountMinor]) => ({ payeeId, amountMinor }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            nativeButton={false}
            render={<Link href="/categorias" />}
          >
            <ArrowLeftIcon /> Categorías
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{category.name}</h1>
            <Badge variant={category.kind === "income" ? "secondary" : "outline"}>
              {category.kind === "income" ? "Ingreso" : "Gasto"}
            </Badge>
            {category.status !== "active" && <Badge variant="outline">{category.status}</Badge>}
          </div>
          {parentName && category.parentCategoryId && (
            <p className="text-sm text-muted-foreground">
              Subcategoría de{" "}
              <Link href={`/categorias/${category.parentCategoryId}`} className="underline underline-offset-2">
                {parentName}
              </Link>
            </p>
          )}
          {children.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              Subcategorías:
              {children.map((c) => (
                <Link key={c.id} href={`/categorias/${c.id}`}>
                  <Badge variant="outline">{c.name}</Badge>
                </Link>
              ))}
            </p>
          )}
        </div>
        <CategoryFormDialog
          categories={allCategories}
          category={category}
          trigger={
            <Button variant="outline" size="sm">
              <PencilIcon /> Editar
            </Button>
          }
        />
      </div>

      {isUnused && (
        <CategoryArchiveSuggestion categoryId={category.id} monthsSinceLastTx={monthsSinceLastTx!} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {currencies.map((currency) => (
          <Card key={currency}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Total ({currency})</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-semibold">
                {formatMoney(totalsByCurrency.get(currency) ?? 0, currency)}
              </span>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Meses con actividad</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{monthsActive}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Última transacción</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{lastAlloc ? formatDate(lastAlloc.date) : "—"}</span>
          </CardContent>
        </Card>
      </div>

      {currencies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tendencia mensual</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {currencies.map((currency, i) => (
              <div key={currency} className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">{currency}</span>
                <CategoryTrendChart
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

      <div className="grid gap-4 lg:grid-cols-2">
        {topPayees.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Payees principales</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payee</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPayees.map((p) => (
                    <TableRow key={p.payeeId}>
                      <TableCell className="font-medium">
                        {payeeName.get(p.payeeId) ?? p.payeeId}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(p.amountMinor, currencies[0] ?? "COP")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {categoryBudgets.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Historial de presupuesto</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Presupuestado</TableHead>
                    <TableHead className="text-right">Gastado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryBudgets.map((b) => {
                    const spent = allocations
                      .filter((a) => monthKey(a.date) === b.month)
                      .reduce((s, a) => s + a.amountMinor, 0);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.month}</TableCell>
                        <TableCell className="text-right">
                          {formatMoney(b.budgetedMinor, currencies[0] ?? "COP")}
                        </TableCell>
                        <TableCell
                          className={`text-right ${spent > b.budgetedMinor ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {formatMoney(spent, currencies[0] ?? "COP")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{categoryTx.length} transacciones</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryTx.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay transacciones en esta categoría.
            </p>
          ) : (
            <TransaccionesTable
              transactions={categoryTx}
              accounts={allAccounts}
              categories={allCategories}
              payees={allPayees}
              splitsByTx={splitsByTx}
            />
          )}
        </CardContent>
      </Card>

      {splitsIntoThisCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{splitsIntoThisCategory.length} desglosado(s) de otras transacciones</CardTitle>
            <p className="text-sm text-muted-foreground">
              Parte del monto de otra transacción (ej. un retiro de efectivo) que asignaste a esta categoría.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {splitsIntoThisCategory.map((s) => {
                  const parent = splitParentById.get(s.transactionId);
                  if (!parent) return null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{formatDate(parent.date)}</TableCell>
                      <TableCell className="max-w-[240px] truncate">
                        {s.description || parent.description || "—"}
                      </TableCell>
                      <TableCell>{s.payeeId ? (payeeName.get(s.payeeId) ?? "—") : "—"}</TableCell>
                      <TableCell className="text-right">
                        {formatMoney(s.amountMinor, parent.currency)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/transacciones?q=${encodeURIComponent(parent.description ?? "")}`}
                          className="text-xs text-muted-foreground underline underline-offset-2"
                        >
                          Ver transacción
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

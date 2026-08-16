import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ArrowLeftIcon, PencilIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, budgets, categories, payees, transactions } from "@/db/schema";
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
import { CategoryTrendChart } from "@/components/category-trend-chart";
import { TransaccionesTable } from "@/components/transacciones-table";
import { CHART_COLORS } from "@/components/net-worth-chart";
import { monthlyAmounts, monthKey } from "@/lib/spending-stats";
import { formatDate, formatMoney } from "@/lib/format";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [allCategories, allAccounts, allPayees, categoryTx, categoryBudgets] = await Promise.all([
    db.select().from(categories),
    db.select().from(accounts),
    db.select().from(payees),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.categoryId, id), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.date)),
    db.select().from(budgets).where(eq(budgets.categoryId, id)).orderBy(desc(budgets.month)),
  ]);

  const category = allCategories.find((c) => c.id === id);
  if (!category) notFound();

  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const payeeName = new Map(allPayees.map((p) => [p.id, p.name]));
  const parentName = category.parentCategoryId ? categoryName.get(category.parentCategoryId) : null;
  const children = allCategories.filter((c) => c.parentCategoryId === id);

  const currencies = [...new Set(categoryTx.map((t) => t.currency))];
  const totalsByCurrency = new Map<string, number>();
  for (const t of categoryTx) {
    totalsByCurrency.set(t.currency, (totalsByCurrency.get(t.currency) ?? 0) + t.amountMinor);
  }

  const monthsActive = new Set(categoryTx.map((t) => monthKey(t.date))).size;
  const lastTx = categoryTx[0] ?? null;

  const payeeTotals = new Map<string, number>();
  for (const t of categoryTx) {
    if (!t.payeeId) continue;
    payeeTotals.set(t.payeeId, (payeeTotals.get(t.payeeId) ?? 0) + t.amountMinor);
  }
  const topPayees = [...payeeTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([payeeId, amountMinor]) => ({ payeeId, amountMinor }));

  const trendType = category.kind === "income" ? "income" : "expense";

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
            <span className="text-2xl font-semibold">{lastTx ? formatDate(lastTx.date) : "—"}</span>
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
                    categoryTx.filter((t) => t.currency === currency),
                    12,
                    trendType
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
                    const spent = categoryTx
                      .filter((t) => t.type === "expense" && monthKey(t.date) === b.month)
                      .reduce((s, t) => s + t.amountMinor, 0);
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
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ArrowLeftIcon, PencilIcon, XIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, budgets, categories, payees, transactions, transactionSplits } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { MonthlyTrendChart } from "@/components/monthly-trend-chart";
import { CategoryBreakdownChart, type CategoryBreakdownEntry } from "@/components/category-breakdown-chart";
import { TransaccionesTable } from "@/components/transacciones-table";
import { CHART_COLORS } from "@/components/net-worth-chart";
import { monthlyAmounts, monthKey } from "@/lib/spending-stats";
import { monthLabel } from "@/lib/month";
import { groupSplitsByTransaction, buildAllocations } from "@/lib/splits";
import { formatDate, formatMoney } from "@/lib/format";
import { getAllProjectNames } from "@/app/proyectos/actions";

export default async function CategoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; subcategory?: string }>;
}) {
  const { id } = await params;
  const { month, subcategory } = await searchParams;

  const [allCategories, allAccounts, allPayees, allSplits, projectNames] = await Promise.all([
    db.select().from(categories),
    db.select().from(accounts),
    db.select().from(payees),
    db.select().from(transactionSplits),
    getAllProjectNames(),
  ]);

  const category = allCategories.find((c) => c.id === id);
  if (!category) notFound();

  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const payeeName = new Map(allPayees.map((p) => [p.id, p.name]));
  const parentName = category.parentCategoryId ? categoryName.get(category.parentCategoryId) : null;
  const children = allCategories.filter((c) => c.parentCategoryId === id);
  // A parent category's page rolls up its subcategories' activity too — the
  // "Sin subcategoría" bucket in the breakdown chart is whatever was tagged
  // directly with this category's own id rather than one of them.
  const categoryIdsInScope = [id, ...children.map((c) => c.id)];

  const [categoryTx, categoryBudgets] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(and(inArray(transactions.categoryId, categoryIdsInScope), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.date)),
    db.select().from(budgets).where(eq(budgets.categoryId, id)).orderBy(desc(budgets.month)),
  ]);

  const splitsByTx = groupSplitsByTransaction(allSplits);
  // Splits from OTHER transactions (e.g. a cash withdrawal tagged "Efectivo")
  // that got specifically broken down into this category or a subcategory.
  const splitsIntoThisCategory = allSplits.filter(
    (s) => s.categoryId && categoryIdsInScope.includes(s.categoryId)
  );
  const splitParentIds = [...new Set(splitsIntoThisCategory.map((s) => s.transactionId))];
  const splitParentTx =
    splitParentIds.length > 0
      ? await db.select().from(transactions).where(inArray(transactions.id, splitParentIds))
      : [];
  const splitParentById = new Map(splitParentTx.map((t) => [t.id, t]));

  const allocations = buildAllocations(categoryTx, splitsByTx, splitsIntoThisCategory, splitParentById);

  const currencies = [...new Set(allocations.map((a) => a.currency))];
  const totalsByCurrency = new Map<string, number>();
  for (const a of allocations) {
    totalsByCurrency.set(a.currency, (totalsByCurrency.get(a.currency) ?? 0) + a.amountMinor);
  }

  function breakdownForCurrency(currency: string): CategoryBreakdownEntry[] {
    const totals = new Map<string, number>();
    for (const a of allocations) {
      if (a.currency !== currency || !a.categoryId) continue;
      totals.set(a.categoryId, (totals.get(a.categoryId) ?? 0) + a.amountMinor);
    }
    return [...totals.entries()]
      .map(([categoryId, amountMinor]) => ({
        categoryId,
        name: categoryId === id ? "Sin subcategoría" : (categoryName.get(categoryId) ?? categoryId),
        amountMinor,
      }))
      .sort((a, b) => b.amountMinor - a.amountMinor);
  }

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

  const filteredCategoryTx = categoryTx.filter((t) => {
    if (month && monthKey(t.date) !== month) return false;
    if (subcategory && t.categoryId !== subcategory) return false;
    return true;
  });

  function filterHref(overrides: { month?: string | null; subcategory?: string | null }) {
    const params = new URLSearchParams();
    const nextMonth = overrides.month !== undefined ? overrides.month : month;
    const nextSubcategory = overrides.subcategory !== undefined ? overrides.subcategory : subcategory;
    if (nextMonth) params.set("month", nextMonth);
    if (nextSubcategory) params.set("subcategory", nextSubcategory);
    const qs = params.toString();
    return qs ? `/categorias/${id}?${qs}` : `/categorias/${id}`;
  }

  const subcategoryFilterName = subcategory
    ? subcategory === id
      ? "Sin subcategoría"
      : (categoryName.get(subcategory) ?? subcategory)
    : null;

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
          {children.length > 0 && (
            <span className="text-xs text-muted-foreground">Incluye {children.length} subcategoría(s)</span>
          )}
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

      {children.length > 0 && currencies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Desglose por subcategoría</CardTitle>
            <CardDescription>Haz clic en una barra para filtrar la lista de transacciones.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {currencies.map((currency) => {
              const breakdown = breakdownForCurrency(currency);
              if (breakdown.length === 0) return null;
              return (
                <div key={currency} className="flex flex-col gap-2">
                  {currencies.length > 1 && (
                    <span className="text-sm font-medium text-muted-foreground">{currency}</span>
                  )}
                  <CategoryBreakdownChart data={breakdown} currency={currency} />
                </div>
              );
            })}
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{filteredCategoryTx.length} transacciones</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {month && (
                <Link
                  href={filterHref({ month: null })}
                  className="flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Filtrado por {monthLabel(month)} <XIcon className="size-3" />
                </Link>
              )}
              {subcategoryFilterName && (
                <Link
                  href={filterHref({ subcategory: null })}
                  className="flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {subcategoryFilterName} <XIcon className="size-3" />
                </Link>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCategoryTx.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {month || subcategory
                ? "No hay transacciones que coincidan con este filtro."
                : "Todavía no hay transacciones en esta categoría."}
            </p>
          ) : (
            <TransaccionesTable
              transactions={filteredCategoryTx}
              accounts={allAccounts}
              categories={allCategories}
              payees={allPayees}
              projectNames={projectNames}
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
                      <Link href={`/payees/${p.payeeId}`} className="hover:underline">
                        {payeeName.get(p.payeeId) ?? p.payeeId}
                      </Link>
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
    </div>
  );
}

import Link from "next/link";
import { desc, eq, isNull } from "drizzle-orm";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, budgets, categories, settings, transactions } from "@/db/schema";
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
import { NetWorthChart, CHART_COLORS } from "@/components/net-worth-chart";
import { AuditedAmount } from "@/components/audited-amount";
import { auditLink } from "@/lib/transactions-query";
import { summarizeMonth } from "@/lib/month-summary";
import {
  buildCategoryDeltas,
  MonthOverMonthCard,
} from "@/components/month-over-month";
import { netWorthTrendFromMonthly } from "@/lib/balance";
import {
  currentBalances,
  movementByAccountAndMonth,
  spendByCategoryInMonth,
  totalsByMonth,
  totalsFor,
} from "@/lib/aggregates";
import { monthKey, monthLabel, shiftMonth } from "@/lib/month";
import { formatDate, formatMoney } from "@/lib/format";
import {
  ACCOUNT_TYPE_LABELS,
  TRANSACTION_TYPE_LABELS,
  type AccountType,
  type TransactionType,
} from "@/lib/enums";

function MonthDelta({ current, previous, higherIsBad }: { current: number; previous: number; higherIsBad: boolean }) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const isUp = pct > 0;
  const isGood = isUp ? !higherIsBad : higherIsBad;
  if (Math.abs(pct) < 0.5) return <span className="text-xs text-muted-foreground">= vs mes pasado</span>;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs ${isGood ? "text-success" : "text-destructive"}`}
    >
      {isUp ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
      {Math.abs(pct).toFixed(0)}% vs mes pasado
    </span>
  );
}

// Reads live data with no dynamic API to force Next to treat it as such —
// see the comment in src/app/configuracion/page.tsx for why this matters.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const currentMonth = monthKey(new Date());
  const lastMonth = shiftMonth(currentMonth, -1);
  const TREND_MONTHS = 12;

  // Everything the cards need is a GROUP BY, not a table scan. The full
  // transaction list used to be loaded here just to be reduced in memory; at
  // 50k rows that was 26 MB of payload for a page that only ever displays
  // aggregates. See src/lib/aggregates.ts.
  const [
    allAccounts,
    allCategories,
    allBudgets,
    settingsRow,
    balances,
    totals,
    spendThisMonth,
    spendLastMonth,
  ] = await Promise.all([
    db.select().from(accounts),
    db.select().from(categories),
    db.select().from(budgets),
    db.select().from(settings).where(eq(settings.id, "default")).then((r) => r[0]),
    currentBalances(),
    totalsByMonth([currentMonth, lastMonth]),
    spendByCategoryInMonth(currentMonth),
    // One extra GROUP BY, same cost as the one above. It buys the comparison
    // card below, which is the question this page exists to answer.
    spendByCategoryInMonth(lastMonth),
  ]);

  // The trend reconstructs month-end balances by unwinding movements, which
  // only needs each month's SUM — so the movements are summed by month in SQL
  // rather than walked row by row.
  const trend = netWorthTrendFromMonthly(
    allAccounts,
    balances,
    await movementByAccountAndMonth(
      shiftMonth(currentMonth, -(TREND_MONTHS - 1)),
      currentMonth
    ),
    TREND_MONTHS
  );

  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));

  const expenseThisMonth = totalsFor(totals, currentMonth, "expense");
  const expenseLastMonth = totalsFor(totals, lastMonth, "expense");
  const incomeThisMonth = totalsFor(totals, currentMonth, "income");
  const incomeLastMonth = totalsFor(totals, lastMonth, "income");
  const monthCurrencies = [...new Set([...expenseThisMonth.keys(), ...incomeThisMonth.keys()])];

  const spendCurrencies = [...new Set(spendThisMonth.map((c) => c.currency))];

  // ¿A dónde fue mi plata?, one sentence per currency, from the deltas the
  // comparison card computes anyway. It cannot disagree with the table below
  // it because it is the same pass, and it costs nothing extra.
  const monthSummaries = [
    ...new Set([...spendThisMonth, ...spendLastMonth].map((c) => c.currency)),
  ].map((currency) => {
    const deltas = buildCategoryDeltas(
      spendThisMonth.filter((c) => c.currency === currency),
      spendLastMonth.filter((c) => c.currency === currency),
      Number.MAX_SAFE_INTEGER
    );
    const nameOf = (categoryId: string) => categoryName.get(categoryId) ?? categoryId;
    const top = deltas.find((d) => d.delta > 0);
    const bottom = deltas.find((d) => d.delta < 0);

    return {
      currency,
      text: summarizeMonth({
        currentLabel: monthLabel(currentMonth),
        previousLabel: monthLabel(lastMonth),
        currency,
        currentTotal: expenseThisMonth.get(currency) ?? 0,
        previousTotal: expenseLastMonth.get(currency) ?? 0,
        topIncrease: top ? { name: nameOf(top.categoryId), amountMinor: top.delta } : null,
        topDecrease: bottom ? { name: nameOf(bottom.categoryId), amountMinor: bottom.delta } : null,
      }),
    };
  });

  // The month-over-month card groups by currency, like the cards above it. With
  // conversion switched off, foreign-currency spend is simply not in these
  // totals — the same quiet rule the budget page follows, and for the same
  // reason: mixing currencies without a rate would make the delta a fiction.
  const comparisonCurrencies = settingsRow?.convertCurrency
    ? [settingsRow.baseCurrency]
    : [...new Set([...spendThisMonth, ...spendLastMonth].map((c) => c.currency))];

  const budgetsThisMonth = allBudgets.filter((b) => b.month === currentMonth);
  const overBudgetCount = budgetsThisMonth.filter((b) => {
    const spent = spendThisMonth.find((c) => c.categoryId === b.categoryId)?.amountMinor ?? 0;
    return spent > b.budgetedMinor;
  }).length;

  const netWorthCurrencies = [...new Set(allAccounts.map((a) => a.currency))].filter((currency) =>
    trend.some((p) => (p.totalsByCurrency[currency] ?? 0) !== 0)
  );
  const recentTransactions = await db
    .select()
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .orderBy(desc(transactions.date))
    .limit(8);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {monthLabel(currentMonth)} — vista general de tus cuentas y movimientos.
        </p>
      </div>

      {monthSummaries.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 p-4">
          {monthSummaries.map((summary) => (
            <p key={summary.currency} className="text-sm">
              {summary.text}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {monthCurrencies.map((currency) => (
          <Card key={`expense-${currency}`}>
            <CardHeader>
              <CardTitle className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Gasto este mes ({currency})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <span className="text-3xl font-semibold tracking-tight">
                {formatMoney(expenseThisMonth.get(currency) ?? 0, currency)}
              </span>
              <MonthDelta
                current={expenseThisMonth.get(currency) ?? 0}
                previous={expenseLastMonth.get(currency) ?? 0}
                higherIsBad
              />
            </CardContent>
          </Card>
        ))}
        {monthCurrencies.map((currency) => (
          <Card key={`income-${currency}`}>
            <CardHeader>
              <CardTitle className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Ingreso este mes ({currency})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <span className="text-3xl font-semibold tracking-tight">
                {formatMoney(incomeThisMonth.get(currency) ?? 0, currency)}
              </span>
              <MonthDelta
                current={incomeThisMonth.get(currency) ?? 0}
                previous={incomeLastMonth.get(currency) ?? 0}
                higherIsBad={false}
              />
            </CardContent>
          </Card>
        ))}
        {budgetsThisMonth.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">Presupuesto este mes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <span className={`text-3xl font-semibold tracking-tight ${overBudgetCount > 0 ? "text-destructive" : ""}`}>
                {overBudgetCount} / {budgetsThisMonth.length}
              </span>
              <Link href="/presupuesto" className="text-xs text-muted-foreground hover:underline">
                categorías sobre presupuesto — ver detalle
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {spendThisMonth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top categorías este mes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {spendCurrencies.map((currency) => {
              const items = spendThisMonth.filter((c) => c.currency === currency).slice(0, 8);
              const max = items[0]?.amountMinor ?? 1;
              return (
                <div key={currency} className="flex flex-col gap-2">
                  {spendCurrencies.length > 1 && (
                    <span className="text-sm font-medium text-muted-foreground">{currency}</span>
                  )}
                  {items.map((c) => (
                    <div key={`${c.categoryId}-${currency}`} className="flex items-center gap-3">
                      <Link href={`/categorias/${c.categoryId}`} className="w-36 shrink-0">
                        <Badge variant="outline" className="max-w-full truncate">
                          {categoryName.get(c.categoryId) ?? c.categoryId}
                        </Badge>
                      </Link>
                      <div className="h-2 flex-1 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${(c.amountMinor / max) * 100}%` }}
                        />
                      </div>
                      <AuditedAmount
                        amountMinor={c.amountMinor}
                        currency={currency}
                        href={auditLink({ category: c.categoryId, month: currentMonth, type: "expense" })}
                        className="w-28 shrink-0 text-right text-sm font-medium"
                        title={`Ver los movimientos de ${categoryName.get(c.categoryId) ?? c.categoryId} en ${currentMonth}`}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {comparisonCurrencies.map((currency) => {
        const deltas = buildCategoryDeltas(
          spendThisMonth.filter((c) => c.currency === currency),
          spendLastMonth.filter((c) => c.currency === currency),
          8
        );
        if (deltas.length === 0) return null;
        return (
          <MonthOverMonthCard
            key={currency}
            deltas={deltas}
            categoryName={categoryName}
            currentMonth={currentMonth}
            previousMonth={lastMonth}
            currentTotal={expenseThisMonth.get(currency) ?? 0}
            previousTotal={expenseLastMonth.get(currency) ?? 0}
            currency={currency}
          />
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Patrimonio neto</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {netWorthCurrencies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay suficiente historial para mostrar una tendencia.
            </p>
          ) : (
            netWorthCurrencies.map((currency, i) => (
              <div key={currency} className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">{currency}</span>
                <NetWorthChart
                  data={trend}
                  currency={currency}
                  color={CHART_COLORS[i % CHART_COLORS.length]}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cuentas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Saldo actual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allAccounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{ACCOUNT_TYPE_LABELS[a.type as AccountType] ?? a.type}</TableCell>
                  <TableCell>{a.currency}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(balances.get(a.id) ?? a.referenceBalanceMinor, a.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transacciones recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{formatDate(tx.date)}</TableCell>
                  <TableCell>{accountName.get(tx.accountId) ?? tx.accountId}</TableCell>
                  <TableCell>
                    {tx.categoryId ? (
                      <Link href={`/categorias/${tx.categoryId}`}>
                        <Badge variant="outline">{categoryName.get(tx.categoryId) ?? tx.categoryId}</Badge>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate">
                    {tx.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={tx.type === "expense" ? "destructive" : "secondary"}>
                      {TRANSACTION_TYPE_LABELS[tx.type as TransactionType] ?? tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(tx.amountMinor, tx.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { budgets, categories, settings, transactions } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BudgetAmountInput } from "@/components/budget-amount-input";
import { MonthSwitcher } from "@/components/month-switcher";
import { monthKey, monthStart, shiftMonth } from "@/lib/month";
import { formatMoney } from "@/lib/format";

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const month = params.month ?? monthKey(new Date());
  const start = monthStart(month);
  const end = monthStart(shiftMonth(month, 1));

  const [settingsRow] = await db.select().from(settings).where(eq(settings.id, "default"));
  const baseCurrency = settingsRow?.baseCurrency ?? "COP";

  const [expenseCategories, allBudgets, allTx] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(and(eq(categories.kind, "expense"), eq(categories.status, "active")))
      .orderBy(asc(categories.name)),
    db.select().from(budgets),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.currency, baseCurrency), isNull(transactions.deletedAt))),
  ]);

  function computeForCategory(categoryId: string) {
    let budgetedThisMonth = 0;
    let budgetedBefore = 0;
    for (const b of allBudgets) {
      if (b.categoryId !== categoryId) continue;
      if (b.month === month) budgetedThisMonth = b.budgetedMinor;
      else if (b.month < month) budgetedBefore += b.budgetedMinor;
    }
    let spentThisMonth = 0;
    let spentBefore = 0;
    for (const t of allTx) {
      if (t.categoryId !== categoryId || t.type !== "expense") continue;
      if (t.date >= start && t.date < end) spentThisMonth += t.amountMinor;
      else if (t.date < start) spentBefore += t.amountMinor;
    }
    const rollover = budgetedBefore - spentBefore;
    return {
      budgeted: budgetedThisMonth,
      spent: spentThisMonth,
      rollover,
      available: rollover + budgetedThisMonth - spentThisMonth,
    };
  }

  const incomeThisMonth = allTx
    .filter((t) => t.type === "income" && t.date >= start && t.date < end)
    .reduce((s, t) => s + t.amountMinor, 0);
  const totalBudgetedThisMonth = allBudgets
    .filter((b) => b.month === month)
    .reduce((s, b) => s + b.budgetedMinor, 0);
  const toBeBudgeted = incomeThisMonth - totalBudgetedThisMonth;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Presupuesto</h1>
          <p className="text-sm text-muted-foreground">
            Presupuesto por sobres, en {baseCurrency}.
          </p>
        </div>
        <MonthSwitcher month={month} />
      </div>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Para presupuestar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <span
            className={`text-2xl font-semibold ${toBeBudgeted < 0 ? "text-destructive" : ""}`}
          >
            {formatMoney(toBeBudgeted, baseCurrency)}
          </span>
          <span className="text-xs text-muted-foreground">
            Ingresos del mes {formatMoney(incomeThisMonth, baseCurrency)} · Presupuestado{" "}
            {formatMoney(totalBudgetedThisMonth, baseCurrency)}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categorías</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Rollover</TableHead>
                <TableHead className="text-right">Presupuestado</TableHead>
                <TableHead className="text-right">Gastado</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenseCategories.map((c) => {
                const { budgeted, spent, rollover, available } = computeForCategory(c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell
                      className={`text-right ${rollover < 0 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {formatMoney(rollover, baseCurrency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <BudgetAmountInput categoryId={c.id} month={month} initial={budgeted} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatMoney(spent, baseCurrency)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${available < 0 ? "text-destructive" : ""}`}
                    >
                      {formatMoney(available, baseCurrency)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

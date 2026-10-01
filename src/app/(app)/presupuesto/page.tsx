import Link from "next/link";
import { and, asc, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { budgets, categories, settings, transactions, transactionSplits } from "@/db/schema";
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
import { categoryAllocations, groupSplitsByTransaction } from "@/lib/splits";
import { monthKey, monthStart, shiftMonth } from "@/lib/month";
import { convert, describeMissingRate, missingRates } from "@/lib/currency";
import { getRateIndex } from "@/app/(app)/configuracion/rates-actions";
import { formatMoney } from "@/lib/format";
import { AuditedAmount } from "@/components/audited-amount";
import { auditLink } from "@/lib/transactions-query";

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
  // Opt-in. When off, foreign-currency amounts are reported per currency and the
  // page says nothing about missing rates — converting is a choice, not a
  // standing chore.
  const convertCurrency = settingsRow?.convertCurrency ?? false;

  const [expenseCategories, allBudgets, allTx, allSplits, rateIndex] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(and(eq(categories.kind, "expense"), eq(categories.status, "active")))
      .orderBy(asc(categories.name)),
    db.select().from(budgets),
    // Every income and expense, in every currency, but only the six columns
    // this page reads. Two changes from before:
    //
    //  - It used to select all nineteen columns of every row, for a page that
    //    only ever totals them.
    //  - `where currency = baseCurrency`, which silently dropped every USD and
    //    EUR transaction: a foreign-currency expense never came out of a COP
    //    envelope, and the page cheerfully reported you were on budget. Amounts
    //    are converted per transaction using that transaction's own month, and
    //    anything with no rate is reported instead of being assumed.
    //
    // Transfers are left out: a budget is about income and spending, and a
    // transfer moves money between your own accounts without spending any.
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        type: transactions.type,
        amountMinor: transactions.amountMinor,
        currency: transactions.currency,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(and(isNull(transactions.deletedAt), ne(transactions.type, "transfer"))),
    db.select().from(transactionSplits),
    getRateIndex(),
  ]);
  const splitsByTx = groupSplitsByTransaction(allSplits);

  // Each transaction is converted with the rate for ITS OWN month, then the
  // converted amount is reused by every total below. `null` means "no rate for
  // this pair in this month" — the amount is excluded and reported, never
  // assumed to be 1:1.
  type ConvertedTx = (typeof allTx)[number] & { converted: number | null; monthKey: string };
  const convertedTx: ConvertedTx[] = allTx.map((t) => ({
    ...t,
    monthKey: monthKey(t.date),
    converted: convert(t.amountMinor, t.currency, baseCurrency, rateIndex, monthKey(t.date)),
  }));
  const usableTx = convertCurrency
    ? convertedTx.filter((t) => t.converted !== null)
    : convertedTx.filter((t) => t.currency === baseCurrency);
  const unconvertible = convertedTx.filter(
    (t) => t.converted === null && t.currency !== baseCurrency
  );
  // Only expenses matter for a budget, so that is what the warning counts.
  const unconvertibleExpenses = unconvertible.filter((t) => t.type === "expense");
  const unconvertibleByCurrency = new Map<string, number>();
  for (const t of unconvertibleExpenses) {
    unconvertibleByCurrency.set(t.currency, (unconvertibleByCurrency.get(t.currency) ?? 0) + 1);
  }

  // Un solo recorrido, no uno por categoría.
  //
  // Esto antes vivía en `computeForCategory`, que se llamaba por cada categoría
  // de gasto y recorría la lista completa de transacciones cada vez: 24 × 50.000
  // iteraciones, cada una repartiendo el gasto entre categorías. El resultado es
  // el mismo — se acumula por categoría en una sola pasada — pero el trabajo
  // baja de O(categorías × movimientos) a O(movimientos).
  const period = new Map<
    string,
    { spentThisMonth: number; spentBefore: number }
  >();
  const bucket = (categoryId: string) => {
    let entry = period.get(categoryId);
    if (!entry) {
      entry = { spentThisMonth: 0, spentBefore: 0 };
      period.set(categoryId, entry);
    }
    return entry;
  };

  let incomeThisMonth = 0;
  for (const t of usableTx) {
    if (t.date >= start && t.date < end) {
      if (t.type === "income") {
        incomeThisMonth += t.converted ?? 0;
        continue;
      }
      if (t.type !== "expense") continue;
    } else if (t.date >= start) {
      continue; // income from a future month is not this month's income
    } else if (t.type !== "expense") {
      continue; // only past spending matters for the rollover
    }

    const inThisMonth = t.date >= start && t.date < end;
    for (const alloc of categoryAllocations(t, splitsByTx)) {
      if (!alloc.categoryId) continue;
      // The split's share of a converted transaction keeps the same ratio, so
      // a breakdown still adds up to the whole after conversion.
      const share = t.amountMinor === 0 ? 0 : alloc.amountMinor / t.amountMinor;
      const amount = t.converted! * share;
      const entry = bucket(alloc.categoryId);
      if (inThisMonth) entry.spentThisMonth += amount;
      else entry.spentBefore += amount;
    }
  }

  // Budget sums in a single pass too, for the same reason.
  const budgeted = new Map<string, { thisMonth: number; before: number }>();
  for (const b of allBudgets) {
    let entry = budgeted.get(b.categoryId);
    if (!entry) {
      entry = { thisMonth: 0, before: 0 };
      budgeted.set(b.categoryId, entry);
    }
    if (b.month === month) entry.thisMonth = b.budgetedMinor;
    else if (b.month < month) entry.before += b.budgetedMinor;
  }

  function computeForCategory(categoryId: string) {
    const budget = budgeted.get(categoryId) ?? { thisMonth: 0, before: 0 };
    const spend = period.get(categoryId) ?? { spentThisMonth: 0, spentBefore: 0 };
    const rollover = budget.before - spend.spentBefore;
    return {
      budgeted: budget.thisMonth,
      spent: spend.spentThisMonth,
      rollover,
      available: rollover + budget.thisMonth - spend.spentThisMonth,
    };
  }
  const totalBudgetedThisMonth = allBudgets
    .filter((b) => b.month === month)
    .reduce((s, b) => s + b.budgetedMinor, 0);
  const toBeBudgeted = incomeThisMonth - totalBudgetedThisMonth;

  // What is being left out, per currency, so the quiet note can be specific.
  const otherCurrencies = [...new Set(allTx.map((t) => t.currency))].filter(
    (c) => c !== baseCurrency
  );
  const otherTotals = otherCurrencies.map((currency) => ({
    currency,
    amount: allTx
      .filter((t) => t.currency === currency && t.type === "expense")
      .reduce((sum, t) => sum + t.amountMinor, 0),
  }));

  // Which rates are absent for the periods this page actually totals. Shown as
  // a warning: the alternative — quietly reporting a smaller number — is how
  // this page used to understate spending.
  const missing = convertCurrency
    ? missingRates(
        convertedTx.map((t) => ({ month: t.monthKey, currency: t.currency })),
        rateIndex,
        baseCurrency
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Presupuesto</h1>
          <p className="text-sm text-muted-foreground">
            Presupuesto por sobres, en {baseCurrency}.
          </p>
        </div>
      {/* Conversion is opt-in. Off: one quiet line saying what is being left
          out, with a link to turn it on. On: a real warning about the rates
          that are missing, because now they are the reason a number reads lower
          than reality. */}
      {!convertCurrency && otherTotals.length > 0 ? (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            Este presupuesto está en <strong>{baseCurrency}</strong>. Los gastos en otras
            monedas se muestran aparte y no se suman:
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {otherTotals.map((o) => (
              <li key={o.currency} className="text-sm">
                <strong>{o.currency}</strong> {formatMoney(o.amount, o.currency)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            <Link
              href="/configuracion#tasas"
              className="text-muted-foreground underline underline-offset-4"
            >
              Sumarlos también, con la TRM oficial
            </Link>
          </p>
        </div>
      ) : null}
        {missing.length > 0 ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium">
            Faltan {missing.length === 1 ? "una tasa de cambio" : `${missing.length} tasas de cambio`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {unconvertibleExpenses.length === 0
              ? `Hay movimientos en otras monedas que no se pueden sumar a ${baseCurrency}.`
              : `${unconvertibleExpenses.length} gasto${unconvertibleExpenses.length === 1 ? "" : "s"} no se está sumando al presupuesto porque no hay con qué convertir${unconvertibleExpenses.length === 1 ? "lo" : "los"} a ${baseCurrency}.`}
          </p>
          {unconvertibleByCurrency.size > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {[...unconvertibleByCurrency]
                .map(([cur, n]) => `${n} en ${cur}`)
                .join(" · ")}
            </p>
          ) : null}
          <ul className="mt-2 flex flex-wrap gap-2">
            {missing.slice(0, 8).map((m) => (
              <li key={`${m.month}-${m.from}`} className="text-xs text-muted-foreground">
                • {describeMissingRate(m)}
              </li>
            ))}
            {missing.length > 8 ? <li className="text-xs text-muted-foreground">• y {missing.length - 8} más</li> : null}
          </ul>
          <p className="mt-3">
            <Link
              href="/configuracion#tasas"
              className="text-sm font-medium text-destructive underline underline-offset-4"
            >
              Registrar tasas
            </Link>
          </p>
        </div>
      ) : null}
      <MonthSwitcher month={month} />
      </div>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">Para presupuestar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <span
            className={`text-3xl font-semibold tracking-tight ${toBeBudgeted < 0 ? "text-destructive" : ""}`}
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
                    <TableCell className="font-medium">
                      <Link href={`/categorias/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell
                      className={`text-right ${rollover < 0 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {formatMoney(rollover, baseCurrency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <BudgetAmountInput categoryId={c.id} month={month} initial={budgeted} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {/* El gasto de este mes y esta categoría, con la lista que
                          lo respalda a un click. */}
                      <AuditedAmount
                        amountMinor={spent}
                        currency={baseCurrency}
                        href={auditLink({ category: c.id, month, type: "expense" })}
                        title={`Ver los movimientos de ${c.name} en ${month}`}
                      />
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

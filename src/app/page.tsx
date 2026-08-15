import { desc, isNull } from "drizzle-orm";

import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
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
import { formatDate, formatMoney } from "@/lib/format";

export default async function DashboardPage() {
  const [allAccounts, allTransactions, allCategories] = await Promise.all([
    db.select().from(accounts),
    db.select().from(transactions).where(isNull(transactions.deletedAt)),
    db.select().from(categories),
  ]);

  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));

  const totalsByCurrency = new Map<string, { expense: number; income: number }>();
  for (const tx of allTransactions) {
    if (tx.type !== "expense" && tx.type !== "income") continue;
    const entry = totalsByCurrency.get(tx.currency) ?? { expense: 0, income: 0 };
    if (tx.type === "expense") entry.expense += tx.amountMinor;
    else entry.income += tx.amountMinor;
    totalsByCurrency.set(tx.currency, entry);
  }

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
          Vista general de tus cuentas y movimientos.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...totalsByCurrency.entries()].map(([currency, t]) => (
          <Card key={currency}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Neto ({currency})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <span className="text-2xl font-semibold">
                {formatMoney(t.income - t.expense, currency)}
              </span>
              <span className="text-xs text-muted-foreground">
                Gastos {formatMoney(t.expense, currency)} · Ingresos{" "}
                {formatMoney(t.income, currency)}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

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
                <TableHead className="text-right">Saldo de referencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allAccounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="capitalize">{a.type.replace("_", " ")}</TableCell>
                  <TableCell>{a.currency}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(a.referenceBalanceMinor, a.currency)}
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
                    {tx.categoryId ? categoryName.get(tx.categoryId) ?? tx.categoryId : "—"}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate">
                    {tx.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={tx.type === "expense" ? "destructive" : "secondary"}>
                      {tx.type}
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

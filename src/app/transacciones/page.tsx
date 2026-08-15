import { desc, isNull } from "drizzle-orm";

import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
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

export default async function TransaccionesPage() {
  const [allTransactions, allAccounts, allCategories] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(isNull(transactions.deletedAt))
      .orderBy(desc(transactions.date)),
    db.select().from(accounts),
    db.select().from(categories),
  ]);

  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Transacciones</h1>
        <p className="text-sm text-muted-foreground">
          {allTransactions.length} movimientos registrados.
        </p>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTransactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{formatDate(tx.date)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        tx.type === "expense"
                          ? "destructive"
                          : tx.type === "income"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{accountName.get(tx.accountId) ?? tx.accountId}</TableCell>
                  <TableCell>
                    {tx.destinationAccountId
                      ? accountName.get(tx.destinationAccountId) ?? tx.destinationAccountId
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {tx.categoryId ? categoryName.get(tx.categoryId) ?? tx.categoryId : "—"}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate">
                    {tx.description ?? "—"}
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

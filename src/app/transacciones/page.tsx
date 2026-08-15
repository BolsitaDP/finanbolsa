import { asc, desc, isNull } from "drizzle-orm";
import { ArrowRightIcon, PencilIcon, PlusIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, categories, payees, transactions } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TransactionFormDialog } from "@/components/transaction-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { formatDate, formatMoney } from "@/lib/format";
import { softDeleteTransaction } from "./actions";

export default async function TransaccionesPage() {
  const [allTransactions, allAccounts, allCategories, allPayees] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(isNull(transactions.deletedAt))
      .orderBy(desc(transactions.date)),
    db.select().from(accounts).orderBy(asc(accounts.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(payees).orderBy(asc(payees.name)),
  ]);

  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const categoryKind = new Map(allCategories.map((c) => [c.id, c.kind]));
  const payeeName = new Map(allPayees.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Transacciones</h1>
          <p className="text-sm text-muted-foreground">
            {allTransactions.length} movimientos registrados.
          </p>
        </div>
        <TransactionFormDialog
          accounts={allAccounts}
          categories={allCategories}
          payees={allPayees}
          trigger={
            <Button size="sm">
              <PlusIcon /> Nueva transacción
            </Button>
          }
        />
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Payee / Descripción</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTransactions.map((tx) => {
                const payee = tx.payeeId ? payeeName.get(tx.payeeId) : null;
                const primaryLabel = payee ?? tx.description ?? (tx.type === "transfer" ? "Transferencia" : "—");
                const showDescriptionSubtext = tx.description && tx.description !== primaryLabel;
                const amountSign = tx.type === "expense" ? "-" : tx.type === "income" ? "+" : "";
                const amountColor =
                  tx.type === "expense"
                    ? "text-destructive"
                    : tx.type === "income"
                      ? "text-green-600 dark:text-green-500"
                      : "text-foreground";

                return (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(tx.date)}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate font-medium">{primaryLabel}</div>
                      {showDescriptionSubtext && (
                        <div className="truncate text-xs text-muted-foreground">
                          {tx.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {tx.categoryId ? (
                        <Badge variant={categoryKind.get(tx.categoryId) === "income" ? "secondary" : "outline"}>
                          {categoryName.get(tx.categoryId) ?? tx.categoryId}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {accountName.get(tx.accountId) ?? tx.accountId}
                        {tx.destinationAccountId && (
                          <>
                            <ArrowRightIcon className="size-3.5 text-muted-foreground" />
                            {accountName.get(tx.destinationAccountId) ?? tx.destinationAccountId}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-medium whitespace-nowrap ${amountColor}`}>
                      {amountSign}
                      {formatMoney(tx.amountMinor, tx.currency)}
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      <TransactionFormDialog
                        accounts={allAccounts}
                        categories={allCategories}
                        payees={allPayees}
                        transaction={tx}
                        trigger={
                          <Button variant="ghost" size="icon-sm">
                            <PencilIcon />
                            <span className="sr-only">Editar</span>
                          </Button>
                        }
                      />
                      <DeleteButton
                        action={softDeleteTransaction.bind(null, tx.id)}
                        confirmMessage="¿Eliminar esta transacción?"
                        successMessage="Transacción eliminada"
                      />
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

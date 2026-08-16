import { asc, isNull } from "drizzle-orm";
import { PlusIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, categories, payees, transactions } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionFormDialog } from "@/components/transaction-form-dialog";
import { TransaccionesTable } from "@/components/transacciones-table";

export default async function TransaccionesPage() {
  const [allTransactions, allAccounts, allCategories, allPayees] = await Promise.all([
    db.select().from(transactions).where(isNull(transactions.deletedAt)),
    db.select().from(accounts).orderBy(asc(accounts.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(payees).orderBy(asc(payees.name)),
  ]);

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
          <TransaccionesTable
            transactions={allTransactions}
            accounts={allAccounts}
            categories={allCategories}
            payees={allPayees}
          />
        </CardContent>
      </Card>
    </div>
  );
}

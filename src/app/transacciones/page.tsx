import { asc, isNull } from "drizzle-orm";
import { PlusIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, categories, payees, transactions, transactionSplits } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionFormDialog } from "@/components/transaction-form-dialog";
import { TransaccionesTable } from "@/components/transacciones-table";
import { groupSplitsByTransaction } from "@/lib/splits";
import { getAllProjectNames } from "@/app/proyectos/actions";

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [allTransactions, allAccounts, allCategories, allPayees, allSplits, projectNames] = await Promise.all([
    db.select().from(transactions).where(isNull(transactions.deletedAt)),
    db.select().from(accounts).orderBy(asc(accounts.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(payees).orderBy(asc(payees.name)),
    db.select().from(transactionSplits),
    getAllProjectNames(),
  ]);
  const splitsByTx = groupSplitsByTransaction(allSplits);

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
          projectNames={projectNames}
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
            projectNames={projectNames}
            initialSearch={q}
            splitsByTx={splitsByTx}
          />
        </CardContent>
      </Card>
    </div>
  );
}

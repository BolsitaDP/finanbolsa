import { count, eq, inArray } from "drizzle-orm";
import { PlusIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, categories, payees, transactions, transactionSplits } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionFormDialog } from "@/components/transaction-form-dialog";
import { TransaccionesTable } from "@/components/transacciones-table";
import { groupSplitsByTransaction } from "@/lib/splits";
import { getAllProjectNames } from "@/app/(app)/proyectos/actions";
import { buildTransactionQuery, parseTransactionFilters } from "@/lib/transactions-query";

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseTransactionFilters(await searchParams);
  const query = buildTransactionQuery(filters);

  // One windowed page instead of the whole table. This is the change that took
  // the page from ~670 KB of transactions over the wire to a few KB.
  const [page, totalRows, allAccounts, allCategories, allPayees, projectNames] = await Promise.all([
    db
      .select()
      .from(transactions)
      .leftJoin(payees, eq(transactions.payeeId, payees.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(query.where)
      .orderBy(...query.orderBy)
      .limit(query.limit)
      .offset(query.offset),
    // Same WHERE, no ORDER BY/LIMIT: the footer needs the real total, which
    // the current page can't tell us.
    db
      .select({ value: count() })
      .from(transactions)
      .leftJoin(payees, eq(transactions.payeeId, payees.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(query.where),
    db.select().from(accounts).orderBy(accounts.name),
    db.select().from(categories).orderBy(categories.name),
    db.select().from(payees).orderBy(payees.name),
    getAllProjectNames(),
  ]);

  const rows = page.map((r) => r.transactions);

  // Splits only for the rows actually on screen. Previously this fetched every
  // split in the database on every page load.
  const splits =
    rows.length > 0
      ? await db
          .select()
          .from(transactionSplits)
          .where(
            inArray(
              transactionSplits.transactionId,
              rows.map((r) => r.id)
            )
          )
      : [];
  const splitsByTx = groupSplitsByTransaction(splits);

  const shownFrom = totalRows[0]?.value === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const shownTo = (filters.page - 1) * filters.pageSize + rows.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Transacciones</h1>
          <p className="text-sm text-muted-foreground">
            {totalRows[0]?.value.toLocaleString("es-CO") ?? 0} movimientos registrados.
            {rows.length > 0 && ` Mostrando ${shownFrom}–${shownTo}.`}
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
            transactions={rows}
            accounts={allAccounts}
            categories={allCategories}
            payees={allPayees}
            projectNames={projectNames}
            filters={filters}
            totalRows={totalRows[0]?.value ?? 0}
            splitsByTx={splitsByTx}
          />
        </CardContent>
      </Card>
    </div>
  );
}

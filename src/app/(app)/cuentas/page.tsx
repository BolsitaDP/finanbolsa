import { asc, count, isNull } from "drizzle-orm";
import { PlusIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AccountFormDialog } from "@/components/account-form-dialog";
import { CuentasTable } from "@/components/cuentas-table";
import { currentBalances } from "@/lib/aggregates";

export default async function CuentasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  // Both of these used to come out of one full transaction scan: the balances
  // by re-walking it in JS, and the per-account counts by counting it. Two
  // aggregates replace the scan — and the counts are what let the table offer
  // "archivar" instead of a delete the foreign key is going to reject.
  const [allAccounts, balances, countRows] = await Promise.all([
    db.select().from(accounts).orderBy(asc(accounts.name)),
    currentBalances(),
    db
      .select({ accountId: transactions.accountId, total: count() })
      .from(transactions)
      .where(isNull(transactions.deletedAt))
      .groupBy(transactions.accountId),
  ]);
  // Maps aren't a valid Server -> Client Component prop (not JSON-serializable),
  // so the computed balances cross that boundary as a plain object.
  const balanceMap = Object.fromEntries(balances);
  const transactionCounts: Record<string, number> = Object.fromEntries(
    countRows.map((row) => [row.accountId, row.total])
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cuentas</h1>
          <p className="text-sm text-muted-foreground">
            Bancos, billeteras, tarjetas de crédito y efectivo.
          </p>
        </div>
        <AccountFormDialog
          trigger={
            <Button size="sm">
              <PlusIcon /> Nueva cuenta
            </Button>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{allAccounts.length} cuentas</CardTitle>
        </CardHeader>
        <CardContent>
          <CuentasTable
            accounts={allAccounts}
            balances={balanceMap}
            transactionCounts={transactionCounts}
            initialSearch={q}
          />
        </CardContent>
      </Card>
    </div>
  );
}

import { asc, isNull } from "drizzle-orm";
import { PlusIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AccountFormDialog } from "@/components/account-form-dialog";
import { CuentasTable } from "@/components/cuentas-table";
import { currentBalances } from "@/lib/balance";

export default async function CuentasPage() {
  const [allAccounts, allTransactions] = await Promise.all([
    db.select().from(accounts).orderBy(asc(accounts.name)),
    db.select().from(transactions).where(isNull(transactions.deletedAt)),
  ]);
  // Maps aren't a valid Server -> Client Component prop (not JSON-serializable),
  // so the computed balances cross that boundary as a plain object.
  const balances = Object.fromEntries(currentBalances(allAccounts, allTransactions));

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
          <CuentasTable accounts={allAccounts} balances={balances} />
        </CardContent>
      </Card>
    </div>
  );
}

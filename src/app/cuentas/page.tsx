import { asc } from "drizzle-orm";
import { PencilIcon, PlusIcon } from "lucide-react";

import { db } from "@/db";
import { accounts } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { AccountFormDialog } from "@/components/account-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { formatDate, formatMoney } from "@/lib/format";
import { deleteAccount } from "./actions";

export default async function CuentasPage() {
  const allAccounts = await db.select().from(accounts).orderBy(asc(accounts.name));

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha ref.</TableHead>
                <TableHead className="text-right">Saldo ref.</TableHead>
                <TableHead className="text-right">Cupo</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allAccounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="capitalize">{a.type.replace("_", " ")}</TableCell>
                  <TableCell>{a.currency}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === "active" ? "secondary" : "outline"}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{a.referenceDate ? formatDate(a.referenceDate) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(a.referenceBalanceMinor, a.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    {a.creditLimitMinor != null ? formatMoney(a.creditLimitMinor, a.currency) : "—"}
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <AccountFormDialog
                      account={a}
                      trigger={
                        <Button variant="ghost" size="icon-sm">
                          <PencilIcon />
                          <span className="sr-only">Editar</span>
                        </Button>
                      }
                    />
                    <DeleteButton
                      action={deleteAccount.bind(null, a.id)}
                      confirmMessage={`¿Eliminar la cuenta "${a.name}"? Esto puede fallar si tiene transacciones asociadas.`}
                      successMessage="Cuenta eliminada"
                    />
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

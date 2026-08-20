"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { DataTableSearchInput } from "@/components/data-table/search-input";
import { BulkActionsBar } from "@/components/data-table/bulk-actions-bar";
import { BulkDeleteButton } from "@/components/data-table/bulk-delete-button";
import { AccountFormDialog } from "@/components/account-form-dialog";
import { BulkEditAccountsDialog } from "@/components/bulk-edit-accounts-dialog";
import { DeleteButton } from "@/components/delete-button";
import { formatDate, formatMoney } from "@/lib/format";
import { bulkDeleteAccounts, deleteAccount } from "@/app/cuentas/actions";
import type { accounts } from "@/db/schema";

type Account = typeof accounts.$inferSelect;

export function CuentasTable({
  accounts,
  balances,
  initialSearch,
}: {
  accounts: Account[];
  balances: Record<string, number>;
  initialSearch?: string;
}) {
  const [search, setSearch] = React.useState(initialSearch ?? "");

  const filtered = React.useMemo(() => {
    if (!search) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) => a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const columns: ColumnDef<Account>[] = React.useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "type",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
        cell: ({ row }) => <span className="capitalize">{row.original.type.replace("_", " ")}</span>,
      },
      {
        accessorKey: "currency",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Moneda" />,
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "secondary" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "referenceDate",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha ref." />,
        cell: ({ row }) =>
          row.original.referenceDate ? formatDate(row.original.referenceDate) : "—",
      },
      {
        accessorKey: "referenceBalanceMinor",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Saldo ref." className="ml-auto justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-right">
            {formatMoney(row.original.referenceBalanceMinor, row.original.currency)}
          </div>
        ),
      },
      {
        id: "currentBalance",
        accessorFn: (a) => balances[a.id] ?? a.referenceBalanceMinor,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Saldo actual" className="ml-auto justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium">
            {formatMoney(balances[row.original.id] ?? row.original.referenceBalanceMinor, row.original.currency)}
          </div>
        ),
      },
      {
        accessorKey: "creditLimitMinor",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Cupo" className="ml-auto justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-right">
            {row.original.creditLimitMinor != null
              ? formatMoney(row.original.creditLimitMinor, row.original.currency)
              : "—"}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <AccountFormDialog
              account={row.original}
              trigger={
                <Button variant="ghost" size="icon-sm">
                  <PencilIcon />
                  <span className="sr-only">Editar</span>
                </Button>
              }
            />
            <DeleteButton
              action={deleteAccount.bind(null, row.original.id)}
              confirmMessage={`¿Eliminar la cuenta "${row.original.name}"? Esto puede fallar si tiene transacciones asociadas.`}
              successMessage="Cuenta eliminada"
            />
          </div>
        ),
      },
    ],
    [balances]
  );

  return (
    <DataTable
      columns={columns}
      data={filtered}
      initialSorting={[{ id: "name", desc: false }]}
      pageSize={50}
      getRowId={(row) => row.id}
      emptyMessage="No hay cuentas que coincidan."
      bulkToolbar={(selected, clear) => {
        const ids = selected.map((a) => a.id);
        return (
          <BulkActionsBar count={selected.length} onClear={clear}>
            <BulkEditAccountsDialog
              ids={ids}
              trigger={
                <Button variant="outline" size="sm">
                  <PencilIcon /> Editar
                </Button>
              }
            />
            <BulkDeleteButton
              count={selected.length}
              action={() => bulkDeleteAccounts(ids)}
              confirmMessage={`¿Eliminar ${selected.length} cuentas? Esto puede fallar si tienen transacciones asociadas.`}
              successMessage={`${selected.length} cuentas eliminadas`}
              onDone={clear}
            />
          </BulkActionsBar>
        );
      }}
      toolbar={() => (
        <DataTableSearchInput value={search} onChange={setSearch} placeholder="Buscar cuenta..." />
      )}
    />
  );
}

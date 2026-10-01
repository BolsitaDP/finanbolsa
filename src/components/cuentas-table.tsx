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
import { ArchiveButton } from "@/components/archive-account-button";
import { formatDate, formatMoney } from "@/lib/format";
import { bulkDeleteAccounts, deleteAccount } from "@/app/(app)/cuentas/actions";
import {
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_TYPE_LABELS,
  type AccountStatus,
  type AccountType,
} from "@/lib/enums";
import type { accounts } from "@/db/schema";

type Account = typeof accounts.$inferSelect;

export function CuentasTable({
  accounts,
  balances,
  transactionCounts,
  initialSearch,
}: {
  accounts: Account[];
  balances: Record<string, number>;
  /** Live transactions per account, from the server. Decides delete vs archive. */
  transactionCounts: Record<string, number>;
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

  // An account with live transactions can never be hard-deleted; the foreign
  // key on transactions.account_id is NOT NULL. The row action switches to
  // "archive" in that case, and the server refuses the delete as a backstop.
  // Stable identity so the columns memo doesn't rebuild on every render.
  const hasHistory = React.useCallback(
    (a: Account) => (transactionCounts[a.id] ?? 0) > 0,
    [transactionCounts]
  );

  const columns: ColumnDef<Account>[] = React.useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        meta: { label: "Nombre" },
      },
      {
        accessorKey: "type",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
        cell: ({ row }) => <span>{ACCOUNT_TYPE_LABELS[row.original.type as AccountType] ?? row.original.type}</span>,
        meta: { label: "Tipo" },
      },
      {
        accessorKey: "currency",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Moneda" />,
        meta: { label: "Moneda" },
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "secondary" : "outline"}>
            {ACCOUNT_STATUS_LABELS[row.original.status as AccountStatus] ?? row.original.status}
          </Badge>
        ),
        meta: { label: "Estado" },
      },
      {
        accessorKey: "referenceDate",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha ref." />,
        cell: ({ row }) =>
          row.original.referenceDate ? formatDate(row.original.referenceDate) : "—",
        meta: { label: "Fecha ref." },
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
        meta: { label: "Saldo ref." },
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
        meta: { label: "Saldo actual" },
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
        meta: { label: "Cupo" },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
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
            {/* A hard delete cannot succeed once a transaction references the
                account (transactions.accountId is NOT NULL with a foreign key),
                and the old message admitted as much while still offering the
                button. Accounts with history get "archive" instead, which keeps
                the history and drops the account from the active set. */}
            {hasHistory(row.original) ? (
              <ArchiveButton accountId={row.original.id} name={row.original.name} />
            ) : (
              <DeleteButton
                action={deleteAccount.bind(null, row.original.id)}
                confirmMessage={`¿Eliminar la cuenta "${row.original.name}"?`}
                successMessage="Cuenta eliminada"
              />
            )}
          </div>
        ),
      },
    ],
    [balances, hasHistory]
  );

  return (
    <DataTable
      columns={columns}
      data={filtered}
      initialSorting={[{ id: "name", desc: false }]}
      pageSize={50}
      getRowId={(row) => row.id}
      emptyNoun="cuentas"
      storageKey="cuentas"
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
              confirmMessage={`¿Eliminar ${selected.length} cuentas? Las que tengan transacciones asociadas no se eliminan: archívalas en su lugar.`}
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

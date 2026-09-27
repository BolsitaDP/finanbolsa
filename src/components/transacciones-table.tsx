"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRightIcon, PencilIcon, SplitIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { DataTableSearchInput } from "@/components/data-table/search-input";
import { BulkActionsBar } from "@/components/data-table/bulk-actions-bar";
import { BulkDeleteButton } from "@/components/data-table/bulk-delete-button";
import { TransactionFormDialog } from "@/components/transaction-form-dialog";
import { BulkEditTransactionsDialog } from "@/components/bulk-edit-transactions-dialog";
import { DeleteButton } from "@/components/delete-button";
import { formatDate, formatMoney } from "@/lib/format";
import { bulkSoftDeleteTransactions, softDeleteTransaction } from "@/app/(app)/transacciones/actions";
import type { transactions, transactionSplits } from "@/db/schema";

type Account = { id: string; name: string; currency: string };
type Category = { id: string; name: string; kind: string; parentCategoryId: string | null };
type Payee = { id: string; name: string };
type Transaction = typeof transactions.$inferSelect;
type TransactionSplit = typeof transactionSplits.$inferSelect;

type Row = {
  raw: Transaction;
  date: Date;
  type: string;
  payeeId: string | null;
  payeeLabel: string | null;
  descriptionLabel: string | null;
  payeeOrDescriptionLabel: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryKind: string | null;
  accountLabel: string;
  accountId: string;
  destinationAccountId: string | null;
  amountMinor: number;
  currency: string;
  hasSplits: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
};

export function TransaccionesTable({
  transactions,
  accounts,
  categories,
  payees,
  projectNames,
  initialSearch,
  splitsByTx,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  projectNames: string[];
  initialSearch?: string;
  splitsByTx?: Map<number, TransactionSplit[]>;
}) {
  const accountName = React.useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const categoryName = React.useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const categoryKind = React.useMemo(() => new Map(categories.map((c) => [c.id, c.kind])), [categories]);
  const payeeName = React.useMemo(() => new Map(payees.map((p) => [p.id, p.name])), [payees]);

  const rows: Row[] = React.useMemo(
    () =>
      transactions.map((tx) => {
        const payee = tx.payeeId ? (payeeName.get(tx.payeeId) ?? null) : null;
        return {
          raw: tx,
          date: tx.date,
          type: tx.type,
          payeeId: tx.payeeId,
          payeeLabel: payee,
          descriptionLabel: tx.description ?? (tx.type === "transfer" ? "Transferencia" : null),
          payeeOrDescriptionLabel:
            tx.type === "transfer"
              ? `De ${accountName.get(tx.accountId) ?? tx.accountId} a ${
                  tx.destinationAccountId
                    ? (accountName.get(tx.destinationAccountId) ?? tx.destinationAccountId)
                    : "cuenta destino"
                }`
              : payee ?? tx.description ?? "",
          categoryId: tx.categoryId,
          categoryName: tx.categoryId ? (categoryName.get(tx.categoryId) ?? tx.categoryId) : null,
          categoryKind: tx.categoryId ? (categoryKind.get(tx.categoryId) ?? null) : null,
          accountLabel: accountName.get(tx.accountId) ?? tx.accountId,
          accountId: tx.accountId,
          destinationAccountId: tx.destinationAccountId,
          amountMinor: tx.amountMinor,
          currency: tx.currency,
          hasSplits: (splitsByTx?.get(tx.id)?.length ?? 0) > 0,
        };
      }),
    [transactions, accountName, categoryName, categoryKind, payeeName, splitsByTx]
  );

  const [search, setSearch] = React.useState(initialSearch ?? "");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [accountFilter, setAccountFilter] = React.useState("all");

  const filteredRows = React.useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (accountFilter !== "all" && r.accountId !== accountFilter) return false;
      if (search) {
        const haystack = `${r.payeeOrDescriptionLabel} ${r.categoryName ?? ""} ${r.accountLabel}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, search, typeFilter, accountFilter]);

  const columns: ColumnDef<Row>[] = React.useMemo(
    () => [
      {
        accessorKey: "date",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.date)}</span>
        ),
        sortingFn: "datetime",
        meta: { label: "Fecha" },
      },
      {
        id: "payeeOrDescription",
        accessorFn: (r) => r.payeeOrDescriptionLabel,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Payee / Descripción" />,
        meta: { label: "Payee / Descripción" },
        cell: ({ row }) => {
          const { type, payeeId, payeeLabel, descriptionLabel, payeeOrDescriptionLabel, hasSplits } = row.original;
          return (
            <div className="flex max-w-[280px] items-center gap-1.5 truncate font-medium">
              {type === "transfer" ? (
                <span className="truncate">{payeeOrDescriptionLabel}</span>
              ) : payeeId && payeeLabel ? (
                <Link
                  href={`/payees/${payeeId}`}
                  className="truncate hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {payeeLabel}
                </Link>
              ) : (
                <span className="truncate">{descriptionLabel ?? "—"}</span>
              )}
              {hasSplits && (
                <SplitIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Desglosado" />
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "categoryName",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Categoría" />,
        meta: { label: "Categoría" },
        cell: ({ row }) =>
          row.original.categoryName && row.original.categoryId ? (
            <Link href={`/categorias/${row.original.categoryId}`}>
              <Badge variant={row.original.categoryKind === "income" ? "secondary" : "outline"}>
                {row.original.categoryName}
              </Badge>
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "accountLabel",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Cuenta" />,
        meta: { label: "Cuenta" },
        cell: ({ row }) => (
          <div className="flex items-center gap-1 whitespace-nowrap">
            {row.original.accountLabel}
            {row.original.destinationAccountId && (
              <>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" />
                {accountName.get(row.original.destinationAccountId) ?? row.original.destinationAccountId}
              </>
            )}
          </div>
        ),
      },
      {
        accessorKey: "amountMinor",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Monto" className="ml-auto justify-end" />
        ),
        meta: { label: "Monto" },
        cell: ({ row }) => {
          const { type, amountMinor, currency } = row.original;
          const sign = type === "expense" ? "-" : type === "income" ? "+" : "";
          const color =
            type === "expense"
              ? "text-destructive"
              : type === "income"
                ? "text-success"
                : "text-foreground";
          return (
            <div className={`text-right font-medium whitespace-nowrap ${color}`}>
              {sign}
              {formatMoney(amountMinor, currency)}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <TransactionFormDialog
              accounts={accounts}
              categories={categories}
              payees={payees}
              projectNames={projectNames}
              transaction={row.original.raw}
              splits={splitsByTx?.get(row.original.raw.id) ?? []}
              trigger={
                <Button variant="ghost" size="icon-sm">
                  <PencilIcon />
                  <span className="sr-only">Editar</span>
                </Button>
              }
            />
            <DeleteButton
              action={softDeleteTransaction.bind(null, row.original.raw.id)}
              confirmMessage="¿Eliminar esta transacción?"
              successMessage="Transacción eliminada"
            />
          </div>
        ),
      },
    ],
    [accounts, categories, payees, projectNames, accountName, splitsByTx]
  );

  return (
    <DataTable
      columns={columns}
      data={filteredRows}
      initialSorting={[{ id: "date", desc: true }]}
      pageSize={20}
      getRowId={(row) => String(row.raw.id)}
      emptyMessage="No hay transacciones que coincidan."
      storageKey="transacciones"
      bulkToolbar={(selected, clear) => {
        const ids = selected.map((r) => r.raw.id);
        return (
          <BulkActionsBar count={selected.length} onClear={clear}>
            <BulkEditTransactionsDialog
              ids={ids}
              accounts={accounts}
              categories={categories}
              payees={payees}
              projectNames={projectNames}
              trigger={
                <Button variant="outline" size="sm">
                  <PencilIcon /> Editar
                </Button>
              }
            />
            <BulkDeleteButton
              count={selected.length}
              action={() => bulkSoftDeleteTransactions(ids)}
              confirmMessage={`¿Eliminar ${selected.length} transacciones?`}
              successMessage={`${selected.length} transacciones eliminadas`}
              onDone={clear}
            />
          </BulkActionsBar>
        );
      }}
      toolbar={() => (
        <div className="flex flex-wrap items-center gap-2">
          <DataTableSearchInput value={search} onChange={setSearch} placeholder="Buscar payee, categoría..." />
          <Combobox
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v || "all")}
            items={{ all: "Todos los tipos", ...TYPE_LABELS }}
            className="w-[160px]"
          />
          <Combobox
            value={accountFilter}
            onValueChange={(v) => setAccountFilter(v || "all")}
            items={{ all: "Todas las cuentas", ...Object.fromEntries(accounts.map((a) => [a.id, a.name])) }}
            className="w-[180px]"
          />
        </div>
      )}
    />
  );
}

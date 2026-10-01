"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRightIcon, PencilIcon, SplitIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { InlineCategoryCell } from "@/components/inline-category-cell";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { DataTableSearchInput } from "@/components/data-table/search-input";
import { BulkActionsBar } from "@/components/data-table/bulk-actions-bar";
import { BulkDeleteWithUndoButton } from "@/components/delete-button";
import { TransactionFormDialog } from "@/components/transaction-form-dialog";
import { BulkEditTransactionsDialog } from "@/components/bulk-edit-transactions-dialog";
import { DeleteButton } from "@/components/delete-button";
import { formatDate, formatMoney } from "@/lib/format";
import {
  filtersToQueryString,
  PAGE_SIZE_OPTIONS,
  type TransactionFilters,
  type TransactionSort,
} from "@/lib/transactions-query";
import {
  bulkRestoreTransactions,
  bulkSoftDeleteTransactions,
  restoreTransaction,
  softDeleteTransaction,
} from "@/app/(app)/transacciones/actions";
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
  filters,
  totalRows,
  splitsByTx,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  projectNames: string[];
  /**
   * Current view, parsed from the URL by the server. Supply these (via
   * `totalRows`) for the main list, which pages in the database. Omit them on
   * the per-category / per-payee / per-project detail pages: those hand over an
   * already-narrowed set, so filtering it again in the browser costs nothing
   * and avoids a round-trip per keystroke.
   */
  filters?: TransactionFilters;
  totalRows?: number;
  splitsByTx?: Map<number, TransactionSplit[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const serverMode = filters !== undefined && totalRows !== undefined;

  // Every filter and sort change is a URL change. The server re-queries and
  // the page re-renders, so there is exactly one source of truth for what the
  // table shows and any view is shareable.
  const navigate = React.useCallback(
    (next: Partial<TransactionFilters>) => {
      if (!filters) return;
      const merged = { ...filters, ...next };
      // Any change other than paging invalidates the current offset.
      if (next.page === undefined) merged.page = 1;
      router.push(`${pathname}${filtersToQueryString(merged)}`, { scroll: false });
    },
    [filters, pathname, router]
  );

  const accountName = React.useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const categoryName = React.useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const categoryKind = React.useMemo(() => new Map(categories.map((c) => [c.id, c.kind])), [categories]);
  const payeeName = React.useMemo(() => new Map(payees.map((p) => [p.id, p.name])), [payees]);

  // Rows arrive already filtered, sorted and paginated by the server, so this
  // is a straight projection — no client-side filter step.
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

  // Debounced so typing a word doesn't fire a server round-trip per keystroke
  // — which on a Raspberry Pi over a WAN link is the difference between snappy
  // and unusable. The input stays controlled and local; the URL catches up.
  const urlSearch = filters?.q ?? "";
  const [searchDraft, setSearchDraft] = React.useState(urlSearch);
  const [lastUrlSearch, setLastUrlSearch] = React.useState(urlSearch);
  // Adjusting state during render (React's documented pattern for state that
  // must track a prop) rather than in an effect: when the URL changes — browser
  // back button, or the global search jumping to /transacciones?q=… — the
  // input has to adopt the new value before paint. Doing it in an effect would
  // show a stale term for a frame and trigger a cascading re-render.
  if (urlSearch !== lastUrlSearch) {
    setLastUrlSearch(urlSearch);
    setSearchDraft(urlSearch);
  }
  React.useEffect(() => {
    if (!serverMode || searchDraft === urlSearch) return;
    const timer = setTimeout(() => navigate({ q: searchDraft }), 300);
    return () => clearTimeout(timer);
  }, [searchDraft, urlSearch, navigate, serverMode]);

  // Client-mode-only filters, for the detail pages that pass a pre-narrowed set.
  const [localSearch, setLocalSearch] = React.useState("");
  const [localType, setLocalType] = React.useState("all");
  const [localAccount, setLocalAccount] = React.useState("all");
  const [localCategory, setLocalCategory] = React.useState("all");

  const visibleRows = React.useMemo(() => {
    if (serverMode) return rows;
    return rows.filter((r) => {
      if (localType !== "all" && r.type !== localType) return false;
      if (localAccount !== "all" && r.accountId !== localAccount) return false;
      if (localCategory === "none" && r.categoryId) return false;
      if (localCategory !== "all" && localCategory !== "none" && r.categoryId !== localCategory)
        return false;
      if (localSearch) {
        const haystack = `${r.payeeOrDescriptionLabel} ${r.categoryName ?? ""} ${r.accountLabel}`.toLowerCase();
        if (!haystack.includes(localSearch.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, serverMode, localSearch, localType, localAccount, localCategory]);

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
        // The category cell is its own editor: correcting a mis-categorised
        // transaction is the most frequent action in the app, and it used to
        // require opening the full nine-field dialog to reach this one field.
        cell: ({ row }) => (
          <InlineCategoryCell
            transactionId={row.original.raw.id}
            categoryId={row.original.categoryId}
            categoryName={row.original.categoryName}
            categoryKind={row.original.categoryKind}
            categories={categories}
          />
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
            {/* Undo instead of confirm: the row is soft-deleted, so the
                toast's "Deshacer" is a real restore rather than a promise. */}
            <DeleteButton
              action={softDeleteTransaction.bind(null, row.original.raw.id)}
              onUndo={restoreTransaction.bind(null, row.original.raw.id)}
              confirmMessage="¿Eliminar esta transacción?"
              successMessage="Transacción eliminada"
              label="la transacción"
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
      data={visibleRows}
      pageSize={serverMode ? filters.pageSize : 20}
      getRowId={(row) => String(row.raw.id)}
      emptyNoun="transacciones"
      isFiltered={
        serverMode && Boolean(filters?.q || filters?.type !== "all" || filters?.account !== "all")
      }
      storageKey="transacciones"
      initialSorting={serverMode ? undefined : [{ id: "date", desc: true }]}
      server={
        serverMode
          ? {
              totalRows,
              pageIndex: filters.page - 1,
              onPageIndexChange: (index) => navigate({ page: index + 1 }),
              onPageSizeChange: (size) => navigate({ pageSize: size, page: 1 }),
              pageSizeOptions: PAGE_SIZE_OPTIONS,
              sorting: [{ id: filters.sort, desc: filters.dir === "desc" }],
              onSortingChange: (next) => {
                const first = next[0];
                if (!first?.id) return;
                navigate({
                  sort: first.id as TransactionSort,
                  dir: first.desc ? "desc" : "asc",
                });
              },
            }
          : undefined
      }
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
            <BulkDeleteWithUndoButton
              count={selected.length}
              action={() => bulkSoftDeleteTransactions(ids)}
              onUndo={() => bulkRestoreTransactions(ids)}
              successMessage={`${selected.length} transacciones eliminadas`}
              onDone={clear}
            />
          </BulkActionsBar>
        );
      }}
      toolbar={() => (
        <div className="flex flex-wrap items-center gap-2">
          <DataTableSearchInput
            value={serverMode ? searchDraft : localSearch}
            onChange={serverMode ? setSearchDraft : setLocalSearch}
            placeholder="Buscar payee, categoría..."
          />
          <Combobox
            value={serverMode ? filters.type : localType}
            onValueChange={(v) =>
              serverMode
                ? navigate({ type: (v || "all") as TransactionFilters["type"] })
                : setLocalType(v || "all")
            }
            items={{ all: "Todos los tipos", ...TYPE_LABELS }}
            className="w-[160px]"
          />
          <Combobox
            value={serverMode ? filters.category : localCategory}
            onValueChange={(v) =>
              serverMode ? navigate({ category: v || "all" }) : setLocalCategory(v || "all")
            }
            items={{
              all: "Todas las categorías",
              none: "Sin categoría",
              ...Object.fromEntries(categories.map((c) => [c.id, c.name])),
            }}
            className="w-[180px]"
          />
          <Combobox
            value={serverMode ? filters.account : localAccount}
            onValueChange={(v) => (serverMode ? navigate({ account: v || "all" }) : setLocalAccount(v || "all"))}
            items={{ all: "Todas las cuentas", ...Object.fromEntries(accounts.map((a) => [a.id, a.name])) }}
            className="w-[180px]"
          />
        </div>
      )}
    />
  );
}

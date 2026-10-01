"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "./pagination";
import { EmptyState } from "@/components/empty-state";
import { createSelectionColumn } from "./selection-column";
import { DataTableSettings } from "./column-visibility-menu";

declare module "@tanstack/react-table" {
  // The generic params must match the augmented interface's signature even
  // though this extension doesn't reference them.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    // Friendly name shown in the column-visibility toggle — falls back to
    // the column id when omitted (fine for columns that don't need one,
    // like "actions", which is excluded from the list via enableHiding).
    label?: string;
    className?: string;
  }
}

function columnVisibilityStorageKey(storageKey: string) {
  return `finanbolsa:columns:${storageKey}`;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  toolbar,
  bulkToolbar,
  getRowId,
  pageSize = 15,
  /** Plural noun used by the shared empty state, e.g. "transacciones". */
  emptyNoun = "resultados",
  /** True when a search or filter is active — changes which empty state reads correctly. */
  isFiltered = false,
  initialSorting,
  storageKey,
  server,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  toolbar?: (table: TanstackTable<TData>) => React.ReactNode;
  bulkToolbar?: (selectedRows: TData[], clearSelection: () => void) => React.ReactNode;
  getRowId?: (row: TData, index: number) => string;
  pageSize?: number;
  /** Plural noun used by the shared empty state, e.g. "transacciones". */
  emptyNoun?: string;
  isFiltered?: boolean;
  initialSorting?: SortingState;
  // Enables the column-visibility toggle and, keyed by this string, persists
  // the chosen columns to localStorage so they survive a page reload. Pass a
  // name unique per table (e.g. "transacciones").
  storageKey?: string;
  /**
   * Opt in to server-side sorting/filtering/pagination.
   *
   * Tables that omit this keep filtering, sorting and paging in the browser
   * over the full `data` array, which is right for the small reference tables
   * (accounts, categories, payees, rules — dozens of rows at most). A table
   * that outgrows the payload passes `server` and keeps only the current page
   * in `data`, letting the URL drive what the server sends.
   */
  server?: {
    totalRows: number;
    sorting: SortingState;
    onSortingChange: (sorting: SortingState) => void;
    pageIndex: number;
    onPageIndexChange: (pageIndex: number) => void;
    /** Page size is a URL concern in server mode; TanStack's own is ignored. */
    onPageSizeChange?: (pageSize: number) => void;
    pageSizeOptions?: readonly number[];
  };
}) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting ?? []);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  // Server mode is driven entirely by the URL, so TanStack's own state for
  // those three concerns is bypassed. The local state above still exists
  // (TanStack requires the keys) but is never the source of truth.
  const sortingState = server ? server.sorting : sorting;
  const setSortingState = server ? server.onSortingChange : setSorting;
  const pageIndex = server ? server.pageIndex : undefined;
  // Guards against writing back the default {} state before the persisted
  // value (loaded async-ish, on mount) has had a chance to apply — without
  // this, that first write would immediately clobber whatever was saved.
  const [visibilityLoaded, setVisibilityLoaded] = React.useState(!storageKey);

  React.useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(columnVisibilityStorageKey(storageKey));
      if (raw) setColumnVisibility(JSON.parse(raw));
    } catch {
      // Ignore malformed/inaccessible storage — falls back to all columns visible.
    }
    setVisibilityLoaded(true);
  }, [storageKey]);

  React.useEffect(() => {
    if (!storageKey || !visibilityLoaded) return;
    try {
      localStorage.setItem(columnVisibilityStorageKey(storageKey), JSON.stringify(columnVisibility));
    } catch {
      // Ignore write failures (e.g. storage quota, private browsing).
    }
  }, [storageKey, visibilityLoaded, columnVisibility]);

  const allColumns = React.useMemo(() => {
    if (!bulkToolbar) return columns;
    return [createSelectionColumn<TData>() as ColumnDef<TData, TValue>, ...columns];
  }, [columns, bulkToolbar]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: {
      sorting: sortingState,
      columnFilters,
      globalFilter,
      rowSelection,
      columnVisibility,
      ...(pageIndex !== undefined ? { pagination: { pageIndex, pageSize } } : {}),
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sortingState) : updater;
      setSortingState(next);
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId,
    enableRowSelection: !!bulkToolbar,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
    initialState: { pagination: { pageSize } },
    // In server mode the row models must not re-filter/sort/paginate what the
    // server already did — that would paginate a single page of 50 into
    // "page 6 of 1" nonsense. The `manual*` flags are TanStack's supported
    // way to say "this is handled upstream".
    manualSorting: !!server,
    manualFiltering: !!server,
    manualPagination: !!server,
    pageCount: server ? Math.max(1, Math.ceil(server.totalRows / pageSize)) : undefined,
    // TanStack Table defaults to resetting to page 0 whenever `data` gets a
    // new array reference — which happens after every edit here, since a
    // mutation revalidates the server data and the page re-renders with a
    // freshly fetched array. Without this, editing a row while on page 6
    // would silently bounce you back to page 1.
    autoResetPageIndex: false,
    // `autoResetRowSelection` is deliberately left at its default (true). In
    // server mode `data` IS the current page, so a page change or a new filter
    // hands TanStack a fresh array and stale selections are dropped — which is
    // what we want, since those selections would otherwise be applied by
    // index to whatever rows now occupy them.
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const clearSelection = React.useCallback(() => setRowSelection({}), []);

  return (
    <div className="flex flex-col gap-3">
      {/* Fixed floor matching the taller of the two states below (the
          bordered/padded bulk actions bar) so selecting/deselecting rows
          doesn't shift the table underneath. Grid (not flex) so the first
          column still stretches to the full available width like it did
          before this wrapper existed — a flex row would shrink it to
          content width and break the toolbar's own wrapping behavior. */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 min-h-[46px]">
        <div className="min-w-0">
          {selectedRows.length > 0 && bulkToolbar
            ? bulkToolbar(selectedRows, clearSelection)
            : toolbar?.(table)}
        </div>
        <DataTableSettings
          table={table}
          storageKey={storageKey}
          onPageSizeChange={server?.onPageSizeChange}
          pageSizeOptions={server?.pageSizeOptions}
        />
      </div>
      {/* A light single border here (not the heavier ring the surrounding Card
          already uses) — these tables are always inside a Card, so matching
          that same ring treatment would read as a card nested in a card. */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={header.column.columnDef.meta?.className}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={allColumns.length} className="p-0">
                  <EmptyState
                    noun={emptyNoun}
                    isFiltered={isFiltered || (globalFilter !== "" || columnFilters.length > 0)}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        table={table}
        totalRows={server?.totalRows}
        pageSize={server ? pageSize : undefined}
        pageIndex={pageIndex}
      />
    </div>
  );
}

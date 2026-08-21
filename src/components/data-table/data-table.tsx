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
import { createSelectionColumn } from "./selection-column";
import { ColumnVisibilityMenu } from "./column-visibility-menu";

declare module "@tanstack/react-table" {
  // The generic params must match the augmented interface's signature even
  // though this extension doesn't reference them.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    // Friendly name shown in the column-visibility toggle — falls back to
    // the column id when omitted (fine for columns that don't need one,
    // like "actions", which is excluded from the list via enableHiding).
    label?: string;
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
  emptyMessage = "Sin resultados.",
  initialSorting,
  storageKey,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  toolbar?: (table: TanstackTable<TData>) => React.ReactNode;
  bulkToolbar?: (selectedRows: TData[], clearSelection: () => void) => React.ReactNode;
  getRowId?: (row: TData, index: number) => string;
  pageSize?: number;
  emptyMessage?: string;
  initialSorting?: SortingState;
  // Enables the column-visibility toggle and, keyed by this string, persists
  // the chosen columns to localStorage so they survive a page reload. Pass a
  // name unique per table (e.g. "transacciones").
  storageKey?: string;
}) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting ?? []);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
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
    state: { sorting, columnFilters, globalFilter, rowSelection, columnVisibility },
    onSortingChange: setSorting,
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
    // TanStack Table defaults to resetting to page 0 whenever `data` gets a
    // new array reference — which happens after every edit here, since a
    // mutation revalidates the server data and the page re-renders with a
    // freshly fetched array. Without this, editing a row while on page 6
    // would silently bounce you back to page 1.
    autoResetPageIndex: false,
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
        <ColumnVisibilityMenu table={table} />
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
                  <TableHead key={header.id}>
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
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={allColumns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}

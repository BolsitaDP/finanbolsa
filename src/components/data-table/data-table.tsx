"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
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

export function DataTable<TData, TValue>({
  columns,
  data,
  toolbar,
  bulkToolbar,
  getRowId,
  pageSize = 15,
  emptyMessage = "Sin resultados.",
  initialSorting,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  toolbar?: (table: TanstackTable<TData>) => React.ReactNode;
  bulkToolbar?: (selectedRows: TData[], clearSelection: () => void) => React.ReactNode;
  getRowId?: (row: TData, index: number) => string;
  pageSize?: number;
  emptyMessage?: string;
  initialSorting?: SortingState;
}) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting ?? []);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const allColumns = React.useMemo(() => {
    if (!bulkToolbar) return columns;
    return [createSelectionColumn<TData>() as ColumnDef<TData, TValue>, ...columns];
  }, [columns, bulkToolbar]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, columnFilters, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
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
      {selectedRows.length > 0 && bulkToolbar
        ? bulkToolbar(selectedRows, clearSelection)
        : toolbar?.(table)}
      <div className="overflow-x-auto rounded-lg border">
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

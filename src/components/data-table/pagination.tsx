"use client";

import type { Table } from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DataTablePagination<TData>({
  table,
  totalRows,
  pageSize,
  pageIndex,
}: {
  table: Table<TData>;
  // Supplied in server mode: the table only holds the current page, so the
  // real total has to come from the server's COUNT.
  totalRows?: number;
  pageSize?: number;
  pageIndex?: number;
}) {
  const server = totalRows !== undefined && pageSize !== undefined && pageIndex !== undefined;
  const filteredCount = server ? totalRows : table.getFilteredRowModel().rows.length;
  const pageCount = server
    ? Math.max(1, Math.ceil(totalRows / pageSize))
    : table.getPageCount() || 1;
  const currentPage = server ? pageIndex : table.getState().pagination.pageIndex;

  const summary =
    filteredCount === 1 ? "1 fila" : `${filteredCount.toLocaleString("es-CO")} filas`;

  if (filteredCount <= (server ? pageSize : table.getState().pagination.pageSize) && pageCount <= 1) {
    return <div className="px-1 text-sm text-muted-foreground">{summary}</div>;
  }

  // On the last page a partial page is normal, so show the real window rather
  // than pretending every page is full.
  const firstRow = currentPage * pageSize! + 1;
  const lastRow = Math.min(filteredCount, (currentPage + 1) * pageSize!);

  return (
    <div className="flex items-center justify-between px-1">
      <div className="text-sm text-muted-foreground">
        {server ? (
          <>
            {firstRow.toLocaleString("es-CO")}–{lastRow.toLocaleString("es-CO")} de {summary}
          </>
        ) : (
          summary
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          Página {currentPage + 1} de {pageCount}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

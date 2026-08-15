"use client";

import type { Table } from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DataTablePagination<TData>({ table }: { table: Table<TData> }) {
  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount() || 1;

  if (filteredCount <= table.getState().pagination.pageSize && pageCount <= 1) {
    return (
      <div className="px-1 text-sm text-muted-foreground">
        {filteredCount} {filteredCount === 1 ? "fila" : "filas"}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-1">
      <div className="text-sm text-muted-foreground">
        {filteredCount} {filteredCount === 1 ? "fila" : "filas"}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          Página {table.getState().pagination.pageIndex + 1} de {pageCount}
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

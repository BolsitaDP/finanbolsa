"use client";

import * as React from "react";
import type { Table } from "@tanstack/react-table";
import { Settings2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PAGE_SIZE_OPTIONS = [15, 20, 30, 50, 100];

export function DataTableSettings<TData>({
  table,
  storageKey,
}: {
  table: Table<TData>;
  storageKey?: string;
}) {
  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide());

  React.useEffect(() => {
    if (!storageKey) return;
    try {
      const savedPageSize = localStorage.getItem(`finanbolsa:page-size:${storageKey}`);
      if (savedPageSize && PAGE_SIZE_OPTIONS.includes(Number(savedPageSize))) {
        table.setPageSize(Number(savedPageSize));
      }
    } catch {
      // Ignore inaccessible storage and keep the default page size.
    }
  }, [storageKey, table]);

  function changePageSize(value: string) {
    const nextPageSize = Number(value);
    table.setPageSize(nextPageSize);
    if (!storageKey) return;
    try {
      localStorage.setItem(`finanbolsa:page-size:${storageKey}`, String(nextPageSize));
    } catch {
      // Ignore storage write failures.
    }
  }

  if (columns.length === 0 && !storageKey) return null;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Configuración de tabla">
            <Settings2Icon />
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Configuración de tabla</DialogTitle>
          <DialogDescription>
            Personaliza la vista de esta tabla. Tus preferencias se guardan para la próxima vez.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {columns.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Columnas visibles</h3>
              <div className="flex flex-col gap-2">
                {columns.map((column) => (
                  <label key={column.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      onChange={(e) => column.toggleVisibility(e.target.checked)}
                    />
                    {column.columnDef.meta?.label ?? column.id}
                  </label>
                ))}
              </div>
            </section>
          )}
          {storageKey && (
            <section className="flex flex-col gap-2">
              <label htmlFor="data-table-page-size" className="text-sm font-medium">
                Filas por página
              </label>
              <select
                id="data-table-page-size"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={table.getState().pagination.pageSize}
                onChange={(e) => changePageSize(e.target.value)}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} filas
                  </option>
                ))}
              </select>
            </section>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" render={<DialogClose />}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import type { Table } from "@tanstack/react-table";
import { SettingsIcon } from "lucide-react";

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

export function ColumnVisibilityMenu<TData>({ table }: { table: Table<TData> }) {
  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide());
  if (columns.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Columnas visibles">
            <SettingsIcon />
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Columnas visibles</DialogTitle>
          <DialogDescription>
            Elige qué columnas mostrar en esta tabla — se recuerda para la próxima vez.
          </DialogDescription>
        </DialogHeader>
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
        <DialogFooter>
          <Button type="button" variant="outline" render={<DialogClose />}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

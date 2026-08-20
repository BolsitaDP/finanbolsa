"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { DataTableSearchInput } from "@/components/data-table/search-input";
import { BulkActionsBar } from "@/components/data-table/bulk-actions-bar";
import { BulkDeleteButton } from "@/components/data-table/bulk-delete-button";
import { PayeeFormDialog } from "@/components/payee-form-dialog";
import { BulkEditPayeesDialog } from "@/components/bulk-edit-payees-dialog";
import { DeleteButton } from "@/components/delete-button";
import { bulkDeletePayees, deletePayee } from "@/app/payees/actions";
import type { categories, payees } from "@/db/schema";

type Payee = typeof payees.$inferSelect;
type Category = typeof categories.$inferSelect;

export function PayeesTable({
  payees,
  categories,
  initialSearch,
}: {
  payees: Payee[];
  categories: Category[];
  initialSearch?: string;
}) {
  const categoryName = React.useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const [search, setSearch] = React.useState(initialSearch ?? "");

  const filtered = React.useMemo(() => {
    if (!search) return payees;
    const q = search.toLowerCase();
    return payees.filter((p) => p.name.toLowerCase().includes(q));
  }, [payees, search]);

  const columns: ColumnDef<Payee>[] = React.useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: "defaultCategory",
        accessorFn: (p) => (p.defaultCategoryId ? (categoryName.get(p.defaultCategoryId) ?? "") : ""),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Categoría por defecto" />,
        cell: ({ getValue }) => getValue<string>() || "—",
      },
      {
        accessorKey: "notes",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Notas" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.notes ?? "—"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <PayeeFormDialog
              categories={categories}
              payee={row.original}
              trigger={
                <Button variant="ghost" size="icon-sm">
                  <PencilIcon />
                  <span className="sr-only">Editar</span>
                </Button>
              }
            />
            <DeleteButton
              action={deletePayee.bind(null, row.original.id)}
              confirmMessage={`¿Eliminar el payee "${row.original.name}"? Las transacciones que lo usan quedarán sin payee.`}
              successMessage="Payee eliminado"
            />
          </div>
        ),
      },
    ],
    [categories, categoryName]
  );

  return (
    <DataTable
      columns={columns}
      data={filtered}
      initialSorting={[{ id: "name", desc: false }]}
      pageSize={20}
      getRowId={(row) => row.id}
      emptyMessage="No hay payees que coincidan."
      bulkToolbar={(selected, clear) => {
        const ids = selected.map((p) => p.id);
        return (
          <BulkActionsBar count={selected.length} onClear={clear}>
            <BulkEditPayeesDialog
              ids={ids}
              categories={categories}
              trigger={
                <Button variant="outline" size="sm">
                  <PencilIcon /> Editar
                </Button>
              }
            />
            <BulkDeleteButton
              count={selected.length}
              action={() => bulkDeletePayees(ids)}
              confirmMessage={`¿Eliminar ${selected.length} payees? Las transacciones que los usan quedarán sin payee.`}
              successMessage={`${selected.length} payees eliminados`}
              onDone={clear}
            />
          </BulkActionsBar>
        );
      }}
      toolbar={() => (
        <DataTableSearchInput value={search} onChange={setSearch} placeholder="Buscar payee..." />
      )}
    />
  );
}

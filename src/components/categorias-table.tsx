"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { DataTableSearchInput } from "@/components/data-table/search-input";
import { BulkActionsBar } from "@/components/data-table/bulk-actions-bar";
import { BulkDeleteButton } from "@/components/data-table/bulk-delete-button";
import { CategoryFormDialog } from "@/components/category-form-dialog";
import { BulkEditCategoriesDialog } from "@/components/bulk-edit-categories-dialog";
import { DeleteButton } from "@/components/delete-button";
import { bulkDeleteCategories, deleteCategory } from "@/app/categorias/actions";
import type { categories } from "@/db/schema";

type Category = typeof categories.$inferSelect;

export function CategoriasTable({
  categories,
  orderedCategories,
}: {
  categories: Category[];
  orderedCategories: Category[];
}) {
  const nameById = React.useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!search) return orderedCategories;
    const q = search.toLowerCase();
    return orderedCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [orderedCategories, search]);

  const columns: ColumnDef<Category>[] = React.useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
        cell: ({ row }) => (
          <span className={row.original.parentCategoryId ? "pl-6 text-muted-foreground" : "font-medium"}>
            {row.original.parentCategoryId ? `↳ ${row.original.name}` : row.original.name}
          </span>
        ),
      },
      {
        id: "parent",
        accessorFn: (c) => (c.parentCategoryId ? (nameById.get(c.parentCategoryId) ?? "") : ""),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Categoría padre" />,
        cell: ({ getValue }) => (getValue<string>() ? getValue<string>() : "—"),
      },
      {
        accessorKey: "kind",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
        cell: ({ row }) => (
          <Badge variant={row.original.kind === "expense" ? "destructive" : "secondary"}>
            {row.original.kind}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <CategoryFormDialog
              categories={categories}
              category={row.original}
              trigger={
                <Button variant="ghost" size="icon-sm">
                  <PencilIcon />
                  <span className="sr-only">Editar</span>
                </Button>
              }
            />
            <DeleteButton
              action={deleteCategory.bind(null, row.original.id)}
              confirmMessage={`¿Eliminar la categoría "${row.original.name}"? Las transacciones y payees que la usan quedarán sin categoría, el presupuesto asociado se borra, y sus subcategorías (si tiene) pasan a ser principales.`}
              successMessage="Categoría eliminada"
            />
          </div>
        ),
      },
    ],
    [categories, nameById]
  );

  return (
    <DataTable
      columns={columns}
      data={filtered}
      pageSize={50}
      getRowId={(row) => row.id}
      emptyMessage="No hay categorías que coincidan."
      bulkToolbar={(selected, clear) => {
        const ids = selected.map((c) => c.id);
        return (
          <BulkActionsBar count={selected.length} onClear={clear}>
            <BulkEditCategoriesDialog
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
              action={() => bulkDeleteCategories(ids)}
              confirmMessage={`¿Eliminar ${selected.length} categorías? Las transacciones y payees que las usan quedarán sin categoría, el presupuesto asociado se borra, y sus subcategorías (si tienen) pasan a ser principales.`}
              successMessage={`${selected.length} categorías eliminadas`}
              onDone={clear}
            />
          </BulkActionsBar>
        );
      }}
      toolbar={() => (
        <DataTableSearchInput value={search} onChange={setSearch} placeholder="Buscar categoría..." />
      )}
    />
  );
}

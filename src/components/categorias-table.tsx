"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDownIcon, ChevronRightIcon, PencilIcon } from "lucide-react";

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
import { bulkDeleteCategories, deleteCategory } from "@/app/(app)/categorias/actions";
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
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(orderedCategories.filter((c) => !c.parentCategoryId).map((c) => c.id))
  );
  const [expandedLoaded, setExpandedLoaded] = React.useState(false);

  React.useEffect(() => {
    const restore = () => {
      try {
        const saved = localStorage.getItem("finanbolsa:categorias:expanded");
        if (saved) {
          const savedIds = JSON.parse(saved);
          if (Array.isArray(savedIds) && savedIds.every((id) => typeof id === "string")) {
            const parentIds = new Set(
              orderedCategories.filter((category) => !category.parentCategoryId).map((category) => category.id)
            );
            setExpanded(new Set(savedIds.filter((id: string) => parentIds.has(id))));
          }
        }
      } catch {
        // Ignore malformed or inaccessible storage and keep all groups expanded.
      }
      setExpandedLoaded(true);
    };
    const timeoutId = window.setTimeout(restore, 0);
    return () => window.clearTimeout(timeoutId);
  }, [orderedCategories]);

  React.useEffect(() => {
    if (!expandedLoaded) return;
    try {
      localStorage.setItem("finanbolsa:categorias:expanded", JSON.stringify([...expanded]));
    } catch {
      // Ignore storage write failures.
    }
  }, [expanded, expandedLoaded]);

  const childrenByParent = React.useMemo(() => {
    const grouped = new Map<string, Category[]>();
    for (const category of categories) {
      if (!category.parentCategoryId) continue;
      const children = grouped.get(category.parentCategoryId) ?? [];
      children.push(category);
      grouped.set(category.parentCategoryId, children);
    }
    return grouped;
  }, [categories]);

  const visibleCategories = React.useMemo(() => {
    const q = search.toLowerCase();
    if (q) {
      return orderedCategories.filter((category) => {
        if (category.name.toLowerCase().includes(q)) return true;
        const parent = category.parentCategoryId ? categories.find((c) => c.id === category.parentCategoryId) : null;
        return Boolean(parent?.name.toLowerCase().includes(q));
      });
    }
    return orderedCategories.filter(
      (category) => !category.parentCategoryId || expanded.has(category.parentCategoryId)
    );
  }, [categories, expanded, orderedCategories, search]);

  const groupedCategories = React.useMemo(
    () => ({
      expense: visibleCategories.filter((category) => category.kind === "expense"),
      income: visibleCategories.filter((category) => category.kind === "income"),
    }),
    [visibleCategories]
  );

  function columnsFor(): ColumnDef<Category>[] {
    return [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
        cell: ({ row }) => {
          const categoryChildren = childrenByParent.get(row.original.id) ?? [];
          const isExpanded = expanded.has(row.original.id);
          return (
            <div className="flex items-center gap-1">
              {!row.original.parentCategoryId && categoryChildren.length > 0 ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label={isExpanded ? "Ocultar subcategorías" : "Mostrar subcategorías"}
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(row.original.id)) next.delete(row.original.id);
                      else next.add(row.original.id);
                      return next;
                    })
                  }
                >
                  {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </Button>
              ) : (
                <span className="size-8 shrink-0" aria-hidden="true" />
              )}
              <span className={row.original.parentCategoryId ? "text-muted-foreground" : "font-medium"}>
                {row.original.parentCategoryId ? `↳ ${row.original.name}` : row.original.name}
              </span>
            </div>
          );
        },
        meta: { label: "Nombre" },
      },
      {
        id: "parent",
        accessorFn: (c) => (c.parentCategoryId ? (nameById.get(c.parentCategoryId) ?? "") : ""),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Categoría padre" />,
        cell: ({ getValue }) => (getValue<string>() ? getValue<string>() : "—"),
        meta: { label: "Categoría padre" },
      },
      {
        accessorKey: "kind",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
        cell: ({ row }) => (
          <Badge variant={row.original.kind === "expense" ? "destructive" : "secondary"}>
            {row.original.kind}
          </Badge>
        ),
        meta: { label: "Tipo" },
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
        meta: { label: "Estado" },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
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
    ];
  }

  function renderGroup(kind: "expense" | "income", label: string) {
    const group = groupedCategories[kind];
    return (
      <section key={kind} className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">{label}</h2>
          <p className="text-sm text-muted-foreground">
            {group.length} {group.length === 1 ? "categoría visible" : "categorías visibles"}
          </p>
        </div>
        <DataTable
          columns={columnsFor()}
          data={group}
          pageSize={50}
          getRowId={(row) => row.id}
          emptyMessage={`No hay categorías de ${label.toLowerCase()} que coincidan.`}
          storageKey={`categorias-${kind}`}
          bulkToolbar={(selected, clear) => {
            const ids = selected.map((category) => category.id);
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
                  confirmMessage={`¿Eliminar ${selected.length} categorías?`}
                  successMessage={`${selected.length} categorías eliminadas`}
                  onDone={clear}
                />
              </BulkActionsBar>
            );
          }}
        />
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <DataTableSearchInput value={search} onChange={setSearch} placeholder="Buscar categoría..." />
      {renderGroup("expense", "Gastos")}
      {renderGroup("income", "Ingresos")}
    </div>
  );
}

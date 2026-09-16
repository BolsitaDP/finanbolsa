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
import { RuleFormDialog } from "@/components/rule-form-dialog";
import { BulkEditRulesDialog } from "@/components/bulk-edit-rules-dialog";
import { DeleteButton } from "@/components/delete-button";
import { ToggleRuleButton } from "@/components/toggle-rule-button";
import { bulkDeleteRules, deleteRule } from "@/app/reglas/actions";
import type { accounts, categories, payees, rules } from "@/db/schema";

type Rule = typeof rules.$inferSelect;
type Account = typeof accounts.$inferSelect;
type Category = typeof categories.$inferSelect;
type Payee = typeof payees.$inferSelect;

type Row = Rule & { conditionsText: string; actionsText: string };

export function ReglasTable({
  rules,
  categories,
  payees,
  accounts,
}: {
  rules: Row[];
  categories: Category[];
  payees: Payee[];
  accounts: Account[];
}) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!search) return rules;
    const q = search.toLowerCase();
    return rules.filter(
      (r) =>
        (r.name ?? "").toLowerCase().includes(q) ||
        r.conditionsText.toLowerCase().includes(q) ||
        r.actionsText.toLowerCase().includes(q)
    );
  }, [rules, search]);

  const columns: ColumnDef<Row>[] = React.useMemo(
    () => [
      {
        id: "name",
        accessorFn: (r) => r.name ?? `Regla #${r.id}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
        cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
        meta: { label: "Nombre" },
      },
      {
        accessorKey: "conditionsText",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Si" />,
        cell: ({ row }) => (
          <span className="block max-w-[min(36vw,420px)] truncate text-sm text-muted-foreground">
            {row.original.conditionsText}
          </span>
        ),
        enableSorting: false,
        meta: { label: "Si", className: "max-w-[min(36vw,420px)]" },
      },
      {
        accessorKey: "actionsText",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Entonces" />,
        cell: ({ row }) => (
          <span className="block max-w-[min(36vw,420px)] truncate text-sm text-muted-foreground">
            {row.original.actionsText}
          </span>
        ),
        enableSorting: false,
        meta: { label: "Entonces", className: "max-w-[min(36vw,420px)]" },
      },
      {
        accessorKey: "enabled",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
        cell: ({ row }) => <ToggleRuleButton id={row.original.id} enabled={row.original.enabled} />,
        meta: { label: "Estado" },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <RuleFormDialog
              categories={categories}
              payees={payees}
              accounts={accounts}
              rule={row.original}
              trigger={
                <Button variant="ghost" size="icon-sm">
                  <PencilIcon />
                  <span className="sr-only">Editar</span>
                </Button>
              }
            />
            <DeleteButton
              action={deleteRule.bind(null, row.original.id)}
              confirmMessage={`¿Eliminar la regla "${row.original.name ?? `#${row.original.id}`}"?`}
              successMessage="Regla eliminada"
            />
          </div>
        ),
      },
    ],
    [categories, payees, accounts]
  );

  return (
    <DataTable
      columns={columns}
      data={filtered}
      pageSize={20}
      getRowId={(row) => String(row.id)}
      emptyMessage="No hay reglas que coincidan."
      storageKey="reglas"
      bulkToolbar={(selected, clear) => {
        const ids = selected.map((r) => r.id);
        return (
          <BulkActionsBar count={selected.length} onClear={clear}>
            <BulkEditRulesDialog
              ids={ids}
              trigger={
                <Button variant="outline" size="sm">
                  <PencilIcon /> Editar
                </Button>
              }
            />
            <BulkDeleteButton
              count={selected.length}
              action={() => bulkDeleteRules(ids)}
              confirmMessage={`¿Eliminar ${selected.length} reglas?`}
              successMessage={`${selected.length} reglas eliminadas`}
              onDone={clear}
            />
          </BulkActionsBar>
        );
      }}
      toolbar={() => (
        <DataTableSearchInput value={search} onChange={setSearch} placeholder="Buscar regla..." />
      )}
    />
  );
}

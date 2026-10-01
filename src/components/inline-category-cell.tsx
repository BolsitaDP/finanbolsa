"use client";

import * as React from "react";
import { useTransition } from "react";
import { CheckIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { setTransactionCategory } from "@/app/(app)/transacciones/actions";

/**
 * The category table cell, rendered as its own editor.
 *
 * Correcting a mis-categorised transaction is the single most frequent action
 * in this app, and it used to cost six steps: find the row, open the edit
 * dialog, scroll past a six-control date field to reach this one field, pick
 * it, save, and wait for the whole page to revalidate. The cell is the editor.
 *
 * Only the category is offered. Anything else belongs in the full dialog, and
 * letting a one-field edit rewrite a nine-field form would be its own kind of
 * accident — hence a dedicated server action rather than reusing
 * `updateTransaction` with a rebuilt row.
 */
export function InlineCategoryCell({
  transactionId,
  categoryId,
  categoryName,
  categoryKind,
  categories,
}: {
  transactionId: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryKind: string | null;
  categories: { id: string; name: string; kind: string; parentCategoryId: string | null }[];
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(categoryId ?? "none");
  const [isPending, startTransition] = useTransition();

  const items = React.useMemo(
    () => ({
      none: "Sin categoría",
      ...Object.fromEntries(categories.map((c) => [c.id, c.name])),
    }),
    [categories]
  );

  function cancel() {
    setValue(categoryId ?? "none");
    setEditing(false);
  }

  function commit(next: string) {
    const nextId = next === "none" ? null : next;
    if (nextId === categoryId) {
      cancel();
      return;
    }
    startTransition(async () => {
      try {
        await setTransactionCategory(transactionId, nextId);
        toast.success("Categoría actualizada");
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
      }
    });
  }

  if (editing) {
    return (
      <div
        className="flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <Combobox value={value} onValueChange={commit} items={items} className="h-8 w-44" />
        <Button variant="ghost" size="icon-sm" onClick={cancel} disabled={isPending}>
          <CheckIcon />
          <span className="sr-only">Confirmar cambio de categoría</span>
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="group/cat inline-flex max-w-full items-center gap-1 text-left"
      onClick={(e) => {
        e.stopPropagation();
        setValue(categoryId ?? "none");
        setEditing(true);
      }}
      title="Cambiar categoría"
    >
      {categoryId && categoryName ? (
        <Badge
          variant={categoryKind === "income" ? "secondary" : "outline"}
          className="max-w-40 truncate"
        >
          {categoryName}
        </Badge>
      ) : (
        <span className="text-muted-foreground">Sin categoría</span>
      )}
      <PencilIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/cat:opacity-70" />
    </button>
  );
}

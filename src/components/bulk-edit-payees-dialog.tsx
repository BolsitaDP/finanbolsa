"use client";

import { useState } from "react";

import { BulkEditDialog } from "@/components/data-table/bulk-edit-dialog";
import { BulkEditCategoryField } from "@/components/data-table/bulk-edit-field";
import { bulkUpdatePayees, type BulkPayeePatch } from "@/app/payees/actions";

type Category = { id: string; name: string; kind: string; parentCategoryId: string | null };

export function BulkEditPayeesDialog({
  ids,
  categories,
  trigger,
}: {
  ids: string[];
  categories: Category[];
  trigger: React.ReactElement;
}) {
  const [categoryEnabled, setCategoryEnabled] = useState(false);
  const [categoryId, setCategoryId] = useState("");

  async function handleApply() {
    const patch: BulkPayeePatch = {};
    if (categoryEnabled) patch.defaultCategoryId = categoryId === "none" ? null : categoryId;
    await bulkUpdatePayees(ids, patch);
  }

  return (
    <BulkEditDialog trigger={trigger} title="Editar payees" count={ids.length} onApply={handleApply}>
      <BulkEditCategoryField
        label="Categoría por defecto"
        enabled={categoryEnabled}
        onEnabledChange={setCategoryEnabled}
        value={categoryId}
        onValueChange={setCategoryId}
        categories={categories}
      />
    </BulkEditDialog>
  );
}

"use client";

import { useState } from "react";

import { BulkEditDialog } from "@/components/data-table/bulk-edit-dialog";
import { BulkEditSelectField } from "@/components/data-table/bulk-edit-field";
import { bulkUpdateCategories, type BulkCategoryPatch } from "@/app/(app)/categorias/actions";
import {
  CATEGORY_KINDS,
  CATEGORY_KIND_LABELS,
  CATEGORY_STATUSES,
  CATEGORY_STATUS_LABELS,
  labelItems,
  type CategoryKind,
  type CategoryStatus,
} from "@/lib/enums";

type Category = { id: string; name: string };

export function BulkEditCategoriesDialog({
  ids,
  categories,
  trigger,
}: {
  ids: string[];
  categories: Category[];
  trigger: React.ReactElement;
}) {
  const [parentEnabled, setParentEnabled] = useState(false);
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [kindEnabled, setKindEnabled] = useState(false);
  const [kind, setKind] = useState("");
  const [statusEnabled, setStatusEnabled] = useState(false);
  const [status, setStatus] = useState("");

  async function handleApply() {
    const patch: BulkCategoryPatch = {};
    if (parentEnabled) patch.parentCategoryId = parentCategoryId === "none" ? null : parentCategoryId;
    if (kindEnabled && kind) patch.kind = kind as CategoryKind;
    if (statusEnabled && status) patch.status = status as CategoryStatus;
    await bulkUpdateCategories(ids, patch);
  }

  const selectableParents = categories.filter((c) => !ids.includes(c.id));

  return (
    <BulkEditDialog trigger={trigger} title="Editar categorías" count={ids.length} onApply={handleApply}>
      <BulkEditSelectField
        label="Categoría padre"
        enabled={parentEnabled}
        onEnabledChange={setParentEnabled}
        value={parentCategoryId}
        onValueChange={setParentCategoryId}
        items={{
          none: "Ninguna (categoría principal)",
          ...Object.fromEntries(selectableParents.map((c) => [c.id, c.name])),
        }}
        placeholder="Selecciona..."
      />
      <BulkEditSelectField
        label="Tipo"
        enabled={kindEnabled}
        onEnabledChange={setKindEnabled}
        value={kind}
        onValueChange={setKind}
        items={labelItems(CATEGORY_KINDS, CATEGORY_KIND_LABELS)}
        placeholder="Selecciona..."
      />
      <BulkEditSelectField
        label="Estado"
        enabled={statusEnabled}
        onEnabledChange={setStatusEnabled}
        value={status}
        onValueChange={setStatus}
        items={labelItems(CATEGORY_STATUSES, CATEGORY_STATUS_LABELS)}
        placeholder="Selecciona..."
      />
    </BulkEditDialog>
  );
}

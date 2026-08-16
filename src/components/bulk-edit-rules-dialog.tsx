"use client";

import { useState } from "react";

import { BulkEditDialog } from "@/components/data-table/bulk-edit-dialog";
import { BulkEditSelectField } from "@/components/data-table/bulk-edit-field";
import { bulkUpdateRules, type BulkRulePatch } from "@/app/reglas/actions";

export function BulkEditRulesDialog({ ids, trigger }: { ids: number[]; trigger: React.ReactElement }) {
  const [enabledFieldOn, setEnabledFieldOn] = useState(false);
  const [enabledValue, setEnabledValue] = useState("");

  async function handleApply() {
    const patch: BulkRulePatch = {};
    if (enabledFieldOn && enabledValue) patch.enabled = enabledValue === "true";
    await bulkUpdateRules(ids, patch);
  }

  return (
    <BulkEditDialog trigger={trigger} title="Editar reglas" count={ids.length} onApply={handleApply}>
      <BulkEditSelectField
        label="Estado"
        enabled={enabledFieldOn}
        onEnabledChange={setEnabledFieldOn}
        value={enabledValue}
        onValueChange={setEnabledValue}
        items={{ true: "Activa", false: "Inactiva" }}
        placeholder="Selecciona..."
      />
    </BulkEditDialog>
  );
}

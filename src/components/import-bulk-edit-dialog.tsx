"use client";

import { useState } from "react";

import { BulkEditDialog } from "@/components/data-table/bulk-edit-dialog";
import { BulkEditCategoryField, BulkEditSelectField } from "@/components/data-table/bulk-edit-field";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  labelItems,
  type TransactionType,
} from "@/lib/enums";
import { projectTripItems } from "@/lib/project-options";

type Account = { id: string; name: string };
type Category = { id: string; name: string; kind: string; parentCategoryId: string | null };
type Payee = { id: string; name: string };

// Mirrors EditableGroup's own field names in import-wizard.tsx so patches
// can be applied with a plain spread — no server round-trip, this only ever
// touches the wizard's local review-step state before anything is imported.
export type ImportGroupPatch = Partial<{
  typeChoice: TransactionType;
  categoryChoice: string;
  payeeChoice: string;
  destinationChoice: string;
  projectTrip: string;
  createRule: boolean;
  skip: boolean;
}>;

export function ImportBulkEditDialog({
  count,
  accountId,
  accounts,
  categories,
  payees,
  projectNames,
  onApply,
  trigger,
}: {
  count: number;
  accountId: string;
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  projectNames: string[];
  onApply: (patch: ImportGroupPatch) => void;
  trigger: React.ReactElement;
}) {
  const [typeEnabled, setTypeEnabled] = useState(false);
  const [type, setType] = useState("");
  const [categoryEnabled, setCategoryEnabled] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [payeeEnabled, setPayeeEnabled] = useState(false);
  const [payeeId, setPayeeId] = useState("");
  const [destinationEnabled, setDestinationEnabled] = useState(false);
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [projectEnabled, setProjectEnabled] = useState(false);
  const [projectTrip, setProjectTrip] = useState("none");
  const [createRuleEnabled, setCreateRuleEnabled] = useState(false);
  const [createRuleValue, setCreateRuleValue] = useState("");
  const [skipEnabled, setSkipEnabled] = useState(false);
  const [skipValue, setSkipValue] = useState("");

  async function handleApply() {
    const patch: ImportGroupPatch = {};
    if (typeEnabled && type) patch.typeChoice = type as TransactionType;
    if (categoryEnabled) patch.categoryChoice = categoryId;
    if (payeeEnabled) patch.payeeChoice = payeeId;
    if (destinationEnabled) patch.destinationChoice = destinationAccountId;
    if (projectEnabled) patch.projectTrip = projectTrip;
    if (createRuleEnabled && createRuleValue) patch.createRule = createRuleValue === "true";
    if (skipEnabled && skipValue) patch.skip = skipValue === "true";
    onApply(patch);
  }

  return (
    <BulkEditDialog trigger={trigger} title="Editar seleccionados" count={count} onApply={handleApply}>
      <div className="grid grid-cols-2 gap-3">
        <BulkEditSelectField
          label="Tipo"
          enabled={typeEnabled}
          onEnabledChange={setTypeEnabled}
          value={type}
          onValueChange={setType}
          items={labelItems(TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS)}
          placeholder="Selecciona..."
        />
        <BulkEditCategoryField
          label="Categoría"
          enabled={categoryEnabled}
          onEnabledChange={setCategoryEnabled}
          value={categoryId}
          onValueChange={setCategoryId}
          categories={categories}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BulkEditSelectField
          label="Payee"
          enabled={payeeEnabled}
          onEnabledChange={setPayeeEnabled}
          value={payeeId}
          onValueChange={setPayeeId}
          items={{ none: "Sin payee", ...Object.fromEntries(payees.map((p) => [p.id, p.name])) }}
          placeholder="Selecciona..."
        />
        <BulkEditSelectField
          label="Cuenta destino (transferencias)"
          enabled={destinationEnabled}
          onEnabledChange={setDestinationEnabled}
          value={destinationAccountId}
          onValueChange={setDestinationAccountId}
          items={{
            none: "Sin especificar",
            ...Object.fromEntries(accounts.filter((a) => a.id !== accountId).map((a) => [a.id, a.name])),
          }}
          placeholder="Selecciona..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BulkEditSelectField
          label="Proyecto / Viaje"
          enabled={projectEnabled}
          onEnabledChange={setProjectEnabled}
          value={projectTrip}
          onValueChange={setProjectTrip}
          items={projectTripItems(projectNames)}
        />
        <BulkEditSelectField
          label="Crear regla"
          enabled={createRuleEnabled}
          onEnabledChange={setCreateRuleEnabled}
          value={createRuleValue}
          onValueChange={setCreateRuleValue}
          items={{ true: "Sí", false: "No" }}
          placeholder="Selecciona..."
        />
      </div>

      <BulkEditSelectField
        label="Omitir de la importación"
        enabled={skipEnabled}
        onEnabledChange={setSkipEnabled}
        value={skipValue}
        onValueChange={setSkipValue}
        items={{ true: "Sí, omitir", false: "No, incluir" }}
        placeholder="Selecciona..."
      />
    </BulkEditDialog>
  );
}

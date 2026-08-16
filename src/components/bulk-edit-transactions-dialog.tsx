"use client";

import { useState } from "react";

import { BulkEditDialog } from "@/components/data-table/bulk-edit-dialog";
import {
  BulkEditCategoryField,
  BulkEditSelectField,
  BulkEditTextField,
} from "@/components/data-table/bulk-edit-field";
import { bulkUpdateTransactions, type BulkTransactionPatch } from "@/app/transacciones/actions";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/enums";

type Account = { id: string; name: string };
type Category = { id: string; name: string; kind: string; parentCategoryId: string | null };
type Payee = { id: string; name: string };

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
};

export function BulkEditTransactionsDialog({
  ids,
  accounts,
  categories,
  payees,
  trigger,
}: {
  ids: number[];
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  trigger: React.ReactElement;
}) {
  const [typeEnabled, setTypeEnabled] = useState(false);
  const [type, setType] = useState<string>("");
  const [accountEnabled, setAccountEnabled] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [destinationEnabled, setDestinationEnabled] = useState(false);
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [categoryEnabled, setCategoryEnabled] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [payeeEnabled, setPayeeEnabled] = useState(false);
  const [payeeId, setPayeeId] = useState("");
  const [projectEnabled, setProjectEnabled] = useState(false);
  const [projectTrip, setProjectTrip] = useState("");
  const [notesEnabled, setNotesEnabled] = useState(false);
  const [notes, setNotes] = useState("");

  async function handleApply() {
    const patch: BulkTransactionPatch = {};
    if (typeEnabled && type) patch.type = type as TransactionType;
    if (accountEnabled && accountId) patch.accountId = accountId;
    if (destinationEnabled) patch.destinationAccountId = destinationAccountId === "none" ? null : destinationAccountId;
    if (categoryEnabled) patch.categoryId = categoryId === "none" ? null : categoryId;
    if (payeeEnabled) patch.payeeId = payeeId === "none" ? null : payeeId;
    if (projectEnabled) patch.projectTrip = projectTrip || null;
    if (notesEnabled) patch.notes = notes || null;
    await bulkUpdateTransactions(ids, patch);
  }

  return (
    <BulkEditDialog trigger={trigger} title="Editar transacciones" count={ids.length} onApply={handleApply}>
      <BulkEditSelectField
        label="Tipo"
        enabled={typeEnabled}
        onEnabledChange={setTypeEnabled}
        value={type}
        onValueChange={setType}
        items={Object.fromEntries(TRANSACTION_TYPES.map((t) => [t, TYPE_LABELS[t]]))}
        placeholder="Selecciona..."
      />
      <BulkEditSelectField
        label="Cuenta"
        enabled={accountEnabled}
        onEnabledChange={setAccountEnabled}
        value={accountId}
        onValueChange={setAccountId}
        items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
        placeholder="Selecciona..."
      />
      <BulkEditSelectField
        label="Cuenta destino (transferencias)"
        enabled={destinationEnabled}
        onEnabledChange={setDestinationEnabled}
        value={destinationAccountId}
        onValueChange={setDestinationAccountId}
        items={{ none: "Sin especificar", ...Object.fromEntries(accounts.map((a) => [a.id, a.name])) }}
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
      <BulkEditSelectField
        label="Payee"
        enabled={payeeEnabled}
        onEnabledChange={setPayeeEnabled}
        value={payeeId}
        onValueChange={setPayeeId}
        items={{ none: "Sin payee", ...Object.fromEntries(payees.map((p) => [p.id, p.name])) }}
        placeholder="Selecciona..."
      />
      <BulkEditTextField
        label="Proyecto / Viaje"
        enabled={projectEnabled}
        onEnabledChange={setProjectEnabled}
        value={projectTrip}
        onValueChange={setProjectTrip}
        placeholder="Ej. Europa"
      />
      <BulkEditTextField
        label="Notas"
        enabled={notesEnabled}
        onEnabledChange={setNotesEnabled}
        value={notes}
        onValueChange={setNotes}
      />
    </BulkEditDialog>
  );
}

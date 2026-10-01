"use client";

import { useEffect, useState } from "react";

import { BulkEditDialog } from "@/components/data-table/bulk-edit-dialog";
import {
  BulkEditCategoryField,
  BulkEditSelectField,
  BulkEditTextField,
} from "@/components/data-table/bulk-edit-field";
import {
  bulkUpdateTransactions,
  countWithSplits,
  type BulkTransactionPatch,
} from "@/app/(app)/transacciones/actions";
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

export function BulkEditTransactionsDialog({
  ids,
  accounts,
  categories,
  payees,
  projectNames,
  trigger,
}: {
  ids: number[];
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  projectNames: string[];
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
  const [projectTrip, setProjectTrip] = useState("none");
  const [notesEnabled, setNotesEnabled] = useState(false);
  const [notes, setNotes] = useState("");

  // How many of the selected rows carry splits. Fetched when the dialog opens
  // rather than passed down, because the bulk toolbar already holds the ids and
  // the warning is only worth showing if a category change is being applied.
  const [splitsInSelection, setSplitsInSelection] = useState(0);
  useEffect(() => {
    let cancelled = false;
    countWithSplits(ids)
      .then((n) => {
        if (!cancelled) setSplitsInSelection(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ids]);

  async function handleApply() {
    const patch: BulkTransactionPatch = {};
    if (typeEnabled && type) patch.type = type as TransactionType;
    if (accountEnabled && accountId) patch.accountId = accountId;
    if (destinationEnabled) patch.destinationAccountId = destinationAccountId === "none" ? null : destinationAccountId;
    if (categoryEnabled) patch.categoryId = categoryId === "none" ? null : categoryId;
    if (payeeEnabled) patch.payeeId = payeeId === "none" ? null : payeeId;
    if (projectEnabled) patch.projectTrip = projectTrip !== "none" ? projectTrip : null;
    if (notesEnabled) patch.notes = notes || null;
    await bulkUpdateTransactions(ids, patch);
  }

  // The effective type of the batch, so the destination field can react to it.
  // Without this the two fields were independent: you could mark rows as
  // transfers with no destination, which debits the source account and credits
  // nobody — the money leaves the balance with no transaction to show for it.
  const effectiveType = typeEnabled && type ? type : null;
  const destinationRequired = effectiveType === "transfer";
  // When the batch's type is known and is NOT a transfer, a destination is
  // meaningless, so the field is inert rather than freely settable.
  const destinationAllowed = effectiveType === null || destinationRequired;
  // Never let the destination be the same account the money leaves from.
  const destinationItems = {
    ...(destinationRequired ? {} : { none: "Sin especificar" }),
    ...Object.fromEntries(
      accounts
        .filter((a) => !(accountEnabled && a.id === accountId))
        .map((a) => [a.id, a.name])
    ),
  };

  // A transfer without a destination can't be written, so say so before the
  // user fills in the rest of the form and only then finds out.
  const blockedReason =
    destinationRequired && (destinationAccountId === "" || destinationAccountId === "none")
      ? "Una transferencia necesita cuenta destino. Sin ella el dinero sale de la cuenta origen y no llega a ninguna parte."
      : null;

  function resetFields() {
    setTypeEnabled(false);
    setType("");
    setAccountEnabled(false);
    setAccountId("");
    setDestinationEnabled(false);
    setDestinationAccountId("");
    setCategoryEnabled(false);
    setCategoryId("");
    setPayeeEnabled(false);
    setPayeeId("");
    setProjectEnabled(false);
    setProjectTrip("none");
    setNotesEnabled(false);
    setNotes("");
  }

  return (
    <BulkEditDialog
      trigger={trigger}
      title="Editar transacciones"
      count={ids.length}
      onApply={handleApply}
      onClosed={resetFields}
      blockedReason={blockedReason}
      notice={
        categoryEnabled && splitsInSelection > 0 ? (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {splitsInSelection} de las seleccionadas {splitsInSelection === 1 ? "tiene" : "tienen"}{" "}
            desglose. Su categoría solo cambiará por el monto que no está desglosado; el resto
            conserva la categoría de cada desglose.
          </p>
        ) : null
      }
    >
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
        <BulkEditSelectField
          label="Cuenta"
          enabled={accountEnabled}
          onEnabledChange={setAccountEnabled}
          value={accountId}
          onValueChange={setAccountId}
          items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
          placeholder="Selecciona..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BulkEditSelectField
          label="Cuenta destino (solo transferencias)"
          enabled={destinationEnabled && destinationAllowed}
          onEnabledChange={setDestinationEnabled}
          value={destinationAccountId}
          onValueChange={setDestinationAccountId}
          items={destinationItems}
          placeholder={destinationRequired ? "Obligatorio" : "No aplica a este tipo"}
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
          label="Proyecto / Viaje"
          enabled={projectEnabled}
          onEnabledChange={setProjectEnabled}
          value={projectTrip}
          onValueChange={setProjectTrip}
          items={projectTripItems(projectNames)}
        />
      </div>

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

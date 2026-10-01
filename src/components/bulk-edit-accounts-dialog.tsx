"use client";

import { useState } from "react";

import { BulkEditDialog } from "@/components/data-table/bulk-edit-dialog";
import { BulkEditSelectField } from "@/components/data-table/bulk-edit-field";
import { bulkUpdateAccounts, type BulkAccountPatch } from "@/app/(app)/cuentas/actions";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  labelItems,
  CURRENCIES,
  type AccountStatus,
  type AccountType,
  type Currency,
} from "@/lib/enums";

export function BulkEditAccountsDialog({ ids, trigger }: { ids: string[]; trigger: React.ReactElement }) {
  const [typeEnabled, setTypeEnabled] = useState(false);
  const [type, setType] = useState("");
  const [currencyEnabled, setCurrencyEnabled] = useState(false);
  const [currency, setCurrency] = useState("");
  const [statusEnabled, setStatusEnabled] = useState(false);
  const [status, setStatus] = useState("");

  async function handleApply() {
    const patch: BulkAccountPatch = {};
    if (typeEnabled && type) patch.type = type as AccountType;
    if (currencyEnabled && currency) patch.currency = currency as Currency;
    if (statusEnabled && status) patch.status = status as AccountStatus;
    await bulkUpdateAccounts(ids, patch);
  }

  return (
    <BulkEditDialog trigger={trigger} title="Editar cuentas" count={ids.length} onApply={handleApply}>
      <BulkEditSelectField
        label="Tipo"
        enabled={typeEnabled}
        onEnabledChange={setTypeEnabled}
        value={type}
        onValueChange={setType}
        items={labelItems(ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS)}
        placeholder="Selecciona..."
      />
      <BulkEditSelectField
        label="Moneda"
        enabled={currencyEnabled}
        onEnabledChange={setCurrencyEnabled}
        value={currency}
        onValueChange={setCurrency}
        items={Object.fromEntries(CURRENCIES.map((c) => [c, c]))}
        placeholder="Selecciona..."
      />
      <BulkEditSelectField
        label="Estado"
        enabled={statusEnabled}
        onEnabledChange={setStatusEnabled}
        value={status}
        onValueChange={setStatus}
        items={labelItems(ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS)}
        placeholder="Selecciona..."
      />
    </BulkEditDialog>
  );
}

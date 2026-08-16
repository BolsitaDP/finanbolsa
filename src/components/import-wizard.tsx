"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { UploadIcon, ArrowLeftIcon, CheckIcon, PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BulkActionsBar } from "@/components/data-table/bulk-actions-bar";
import { ImportBulkEditDialog, type ImportGroupPatch } from "@/components/import-bulk-edit-dialog";
import { CategorySelect } from "@/components/category-select";

import { bulkImportTransactions, parseStatement } from "@/app/importar/actions";
import type { ParsedGroup } from "@/lib/import-types";
import { TRANSACTION_TYPES, type Currency, type TransactionType } from "@/lib/enums";
import { formatMoney } from "@/lib/format";

type Account = { id: string; name: string; currency: string };
type Category = { id: string; name: string; kind: string; parentCategoryId: string | null };
type Payee = { id: string; name: string };

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
};

type EditableGroup = ParsedGroup & {
  typeChoice: TransactionType;
  payeeChoice: string; // "none" | "new" | payee id
  newPayeeName: string;
  categoryChoice: string; // "none" | category id
  destinationChoice: string; // "none" | account id
  skip: boolean;
  createRule: boolean;
  // Frozen at parse time from whether a payee/rule already suggested a
  // category — used to split the review list into "ya organizados" (a quick
  // sanity check) vs "sueltas" (the ones that actually need attention). This
  // doesn't re-evaluate as the user edits the row, so groups don't jump
  // between sections mid-review.
  wasPreOrganized: boolean;
};

export function ImportWizard({
  accounts,
  categories,
  payees,
}: {
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
}) {
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [groups, setGroups] = useState<EditableGroup[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [summary, setSummary] = useState<{
    imported: number;
    skippedDuplicates: number;
    rulesCreated: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const account = accounts.find((a) => a.id === accountId);
  const totalToImport = groups.filter((g) => !g.skip).reduce((s, g) => s + g.count, 0);

  const looseGroups = useMemo(() => groups.filter((g) => !g.wasPreOrganized), [groups]);
  const organizedGroups = useMemo(() => groups.filter((g) => g.wasPreOrganized), [groups]);

  function handleParse() {
    if (!file || !accountId) {
      toast.error("Selecciona una cuenta y un archivo PDF");
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const result = await parseStatement(accountId, fd);
        setTotalTransactions(result.totalTransactions);
        setSelectedKeys(new Set());
        setGroups(
          result.groups.map((g) => ({
            ...g,
            typeChoice: g.type,
            payeeChoice: g.suggestedPayeeId ?? (g.type === "expense" ? "new" : "none"),
            newPayeeName: g.suggestedPayeeId ? "" : g.merchantLabel,
            categoryChoice: g.suggestedCategoryId ?? "none",
            destinationChoice: "none",
            skip: false,
            // Off by default: with hundreds of one-off "sueltas" transactions
            // per import, auto-creating a rule for every single one is what
            // was flooding the rules list. Opt in per row (or via bulk edit)
            // for the merchants that are actually worth a standing rule.
            createRule: false,
            wasPreOrganized: g.suggestedCategoryId !== null,
          }))
        );
        setStep("review");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al leer el PDF");
      }
    });
  }

  function updateGroup(key: string, patch: Partial<EditableGroup>) {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  }

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll(keys: string[]) {
    setSelectedKeys((prev) => {
      const allSelected = keys.length > 0 && keys.every((k) => prev.has(k));
      const next = new Set(prev);
      for (const k of keys) {
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }

  function applyBulkPatch(patch: ImportGroupPatch) {
    setGroups((prev) => prev.map((g) => (selectedKeys.has(g.key) ? { ...g, ...patch } : g)));
  }

  function handleImport() {
    if (!account) return;
    startTransition(async () => {
      try {
        const input = groups.map((g) => ({
          merchantLabel: g.merchantLabel,
          type: g.typeChoice,
          payeeId: g.payeeChoice !== "none" && g.payeeChoice !== "new" ? g.payeeChoice : null,
          newPayeeName: g.payeeChoice === "new" ? g.newPayeeName || g.merchantLabel : null,
          categoryId: g.categoryChoice !== "none" ? g.categoryChoice : null,
          destinationAccountId: g.destinationChoice !== "none" ? g.destinationChoice : null,
          skip: g.skip,
          createRule: g.createRule,
          transactions: g.transactions,
        }));
        const result = await bulkImportTransactions(accountId, account.currency as Currency, input);
        setSummary(result);
        setStep("done");
        toast.success(`${result.imported} transacciones importadas`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al importar");
      }
    });
  }

  if (step === "done" && summary) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckIcon className="size-5 text-green-600" /> Importación completa
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>{summary.imported} transacciones importadas.</p>
          {summary.skippedDuplicates > 0 && (
            <p className="text-muted-foreground">
              {summary.skippedDuplicates} omitidas por parecer duplicadas.
            </p>
          )}
          {summary.rulesCreated > 0 && (
            <p className="text-muted-foreground">
              {summary.rulesCreated} reglas nuevas creadas para futuras importaciones.
            </p>
          )}
          <Button
            className="mt-2 self-start"
            variant="outline"
            onClick={() => {
              setStep("upload");
              setFile(null);
              setGroups([]);
              setSelectedKeys(new Set());
              setSummary(null);
            }}
          >
            Importar otro extracto
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "review") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {totalTransactions} movimientos en {groups.length} comercios. Se importarán{" "}
            {totalToImport}.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep("upload")}>
              <ArrowLeftIcon /> Volver
            </Button>
            <Button size="sm" disabled={isPending} onClick={handleImport}>
              Importar {totalToImport} transacciones
            </Button>
          </div>
        </div>

        {selectedKeys.size > 0 && (
          <BulkActionsBar count={selectedKeys.size} onClear={() => setSelectedKeys(new Set())}>
            <ImportBulkEditDialog
              count={selectedKeys.size}
              accountId={accountId}
              accounts={accounts}
              categories={categories}
              payees={payees}
              onApply={applyBulkPatch}
              trigger={
                <Button variant="outline" size="sm">
                  <PencilIcon /> Editar
                </Button>
              }
            />
          </BulkActionsBar>
        )}

        <GroupsSection
          title="Transacciones sueltas"
          description="No coinciden con ningún payee o regla existente — revísalas una por una."
          groups={looseGroups}
          accountId={accountId}
          accounts={accounts}
          categories={categories}
          payees={payees}
          updateGroup={updateGroup}
          selectedKeys={selectedKeys}
          onToggleSelected={toggleSelected}
          onToggleSelectAll={toggleSelectAll}
        />

        <GroupsSection
          title="Ya organizados"
          description="Ya coinciden con un payee o regla existente — solo un vistazo rápido."
          groups={organizedGroups}
          accountId={accountId}
          accounts={accounts}
          categories={categories}
          payees={payees}
          updateGroup={updateGroup}
          selectedKeys={selectedKeys}
          onToggleSelected={toggleSelected}
          onToggleSelectAll={toggleSelectAll}
        />
      </div>
    );
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Subir extracto</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Cuenta</label>
          <Select
            value={accountId}
            onValueChange={(v) => v && setAccountId(v)}
            items={Object.fromEntries(accounts.map((a) => [a.id, `${a.name} (${a.currency})`]))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Extracto PDF (Bancolombia, RappiCard o Nu)</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </div>
        <Button onClick={handleParse} disabled={isPending || !file} className="self-start">
          <UploadIcon /> Analizar PDF
        </Button>
      </CardContent>
    </Card>
  );
}

function GroupsSection({
  title,
  description,
  groups,
  accountId,
  accounts,
  categories,
  payees,
  updateGroup,
  selectedKeys,
  onToggleSelected,
  onToggleSelectAll,
}: {
  title: string;
  description: string;
  groups: EditableGroup[];
  accountId: string;
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  updateGroup: (key: string, patch: Partial<EditableGroup>) => void;
  selectedKeys: Set<string>;
  onToggleSelected: (key: string) => void;
  onToggleSelectAll: (keys: string[]) => void;
}) {
  if (groups.length === 0) return null;

  const keys = groups.map((g) => g.key);
  const allSelected = keys.every((k) => selectedKeys.has(k));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title} ({groups.length})
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleSelectAll(keys)}
                  aria-label="Seleccionar todos"
                />
              </TableHead>
              <TableHead>Comercio</TableHead>
              <TableHead className="text-right">#</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Categoría / Destino</TableHead>
              <TableHead>Regla</TableHead>
              <TableHead>Omitir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <GroupRow
                key={g.key}
                g={g}
                accountId={accountId}
                accounts={accounts}
                categories={categories}
                payees={payees}
                updateGroup={updateGroup}
                selected={selectedKeys.has(g.key)}
                onToggleSelect={() => onToggleSelected(g.key)}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function GroupRow({
  g,
  accountId,
  accounts,
  categories,
  payees,
  updateGroup,
  selected,
  onToggleSelect,
}: {
  g: EditableGroup;
  accountId: string;
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  updateGroup: (key: string, patch: Partial<EditableGroup>) => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <TableRow className={g.skip ? "opacity-50" : undefined}>
      <TableCell>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Seleccionar ${g.merchantLabel}`}
        />
      </TableCell>
      <TableCell className="min-w-[160px]">
        <Input
          className="h-7 text-sm"
          value={g.merchantLabel}
          onChange={(e) => updateGroup(g.key, { merchantLabel: e.target.value })}
        />
        {g.duplicateCount > 0 && (
          <Badge variant="outline" className="mt-1">
            {g.duplicateCount} posible(s) duplicado(s)
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">{g.count}</TableCell>
      <TableCell className="text-right">
        {formatMoney(g.totalAmountMinor, accounts.find((a) => a.id === accountId)?.currency ?? "COP")}
      </TableCell>
      <TableCell className="min-w-[130px]">
        <Select
          value={g.typeChoice}
          onValueChange={(v) => v && updateGroup(g.key, { typeChoice: v as TransactionType })}
          items={Object.fromEntries(TRANSACTION_TYPES.map((t) => [t, TYPE_LABELS[t]]))}
        >
          <SelectTrigger className="h-7 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSACTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="min-w-[160px]">
        {g.typeChoice === "transfer" ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            <Select
              value={g.payeeChoice}
              onValueChange={(v) => v && updateGroup(g.key, { payeeChoice: v })}
              items={{
                none: "Sin payee",
                new: "+ Crear nuevo",
                ...Object.fromEntries(payees.map((p) => [p.id, p.name])),
              }}
            >
              <SelectTrigger className="h-7 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin payee</SelectItem>
                <SelectItem value="new">+ Crear nuevo</SelectItem>
                {payees.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {g.payeeChoice === "new" && (
              <Input
                className="h-7 text-sm"
                placeholder="Nombre del payee"
                value={g.newPayeeName}
                onChange={(e) => updateGroup(g.key, { newPayeeName: e.target.value })}
              />
            )}
          </div>
        )}
      </TableCell>
      <TableCell className="min-w-[160px]">
        {g.typeChoice === "transfer" ? (
          <Select
            value={g.destinationChoice}
            onValueChange={(v) => v && updateGroup(g.key, { destinationChoice: v })}
            items={{
              none: "Sin especificar",
              ...Object.fromEntries(accounts.filter((a) => a.id !== accountId).map((a) => [a.id, a.name])),
            }}
          >
            <SelectTrigger className="h-7 w-full text-sm">
              <SelectValue placeholder="Cuenta destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin especificar</SelectItem>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : (
          <CategorySelect
            categories={categories}
            value={g.categoryChoice}
            onValueChange={(v) => updateGroup(g.key, { categoryChoice: v })}
            kind={g.typeChoice === "income" ? "income" : "expense"}
            className="h-7 w-full text-sm"
          />
        )}
      </TableCell>
      <TableCell>
        <input
          type="checkbox"
          checked={g.createRule}
          onChange={(e) => updateGroup(g.key, { createRule: e.target.checked })}
        />
      </TableCell>
      <TableCell>
        <input
          type="checkbox"
          checked={g.skip}
          onChange={(e) => updateGroup(g.key, { skip: e.target.checked })}
        />
      </TableCell>
    </TableRow>
  );
}

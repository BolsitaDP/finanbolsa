"use client";

import { memo, useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { UploadIcon, ArrowLeftIcon, CheckIcon, PencilIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Combobox } from "@/components/ui/combobox";
import { BulkActionsBar } from "@/components/data-table/bulk-actions-bar";
import { ImportBulkEditDialog, type ImportGroupPatch } from "@/components/import-bulk-edit-dialog";
import { CategorySelect } from "@/components/category-select";

import { bulkImportTransactions, parseStatement } from "@/app/(app)/importar/actions";
import type { ParsedGroup } from "@/lib/import-types";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  labelItems,
  type Currency,
  type TransactionType,
} from "@/lib/enums";
import { formatMoney } from "@/lib/format";
import { projectTripItems } from "@/lib/project-options";

type Account = { id: string; name: string; currency: string };
type Category = { id: string; name: string; kind: string; parentCategoryId: string | null };
type Payee = { id: string; name: string };

type EditableGroup = ParsedGroup & {
  typeChoice: TransactionType;
  payeeChoice: string; // "none" | "new" | payee id
  newPayeeName: string;
  categoryChoice: string; // "none" | category id
  destinationChoice: string; // "none" | account id
  projectTrip: string; // "none" | project name
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
  projectNames,
}: {
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  projectNames: string[];
}) {
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [groups, setGroups] = useState<EditableGroup[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [unrecognized, setUnrecognized] = useState<string[]>([]);
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
        setUnrecognized(result.unrecognized);
        setSelectedKeys(new Set());
        setGroups(
          result.groups.map((g) => ({
            ...g,
            typeChoice: g.type,
            payeeChoice: g.suggestedPayeeId ?? "none",
            newPayeeName: g.suggestedPayeeId ? "" : g.merchantLabel,
            categoryChoice: g.suggestedCategoryId ?? "none",
            destinationChoice: "none",
            projectTrip: "none",
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
        setUploadOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al leer el PDF");
      }
    });
  }

  // Stable identities so GroupRow (memoized below) can bail out of
  // re-rendering for every other row when only one row's fields change —
  // with hundreds of rows in a statement, re-rendering all of them on every
  // keystroke is what made typing in a row's fields feel laggy.
  const updateGroup = useCallback((key: string, patch: Partial<EditableGroup>) => {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  }, []);

  const toggleSelected = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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
          projectTrip: g.projectTrip !== "none" ? g.projectTrip : null,
          skip: g.skip,
          createRule: g.createRule,
          transactions: g.transactions,
        }));
        const result = await bulkImportTransactions(
          accountId,
          account.currency as Currency,
          input,
          file?.name ?? "extracto.pdf"
        );
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
            <CheckIcon className="size-5 text-success" /> Importación completa
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
              {summary.rulesCreated} {summary.rulesCreated === 1 ? "regla guardada" : "reglas guardadas"} para
              futuras importaciones.
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
              setUnrecognized([]);
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

        {unrecognized.length > 0 && (
          <Card className="border-warning/40 bg-warning/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-warning">
                <TriangleAlertIcon className="size-4" />
                {unrecognized.length} línea{unrecognized.length === 1 ? "" : "s"} del PDF no se reconocieron
              </CardTitle>
              <CardDescription>
                Estas líneas parecen movimientos pero no coinciden con ningún formato conocido — puede haber un
                tipo de movimiento nuevo (como una devolución) que el importador no sabe interpretar todavía.
                No están incluidas en las {totalTransactions} transacciones de abajo; revísalas manualmente en
                el PDF.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
                {unrecognized.slice(0, 8).map((line, i) => (
                  <li key={i} className="truncate">
                    {line}
                  </li>
                ))}
              </ul>
              {unrecognized.length > 8 && (
                <p className="mt-1 text-xs text-muted-foreground">y {unrecognized.length - 8} más...</p>
              )}
            </CardContent>
          </Card>
        )}

        {selectedKeys.size > 0 && (
          <BulkActionsBar count={selectedKeys.size} onClear={() => setSelectedKeys(new Set())}>
            <ImportBulkEditDialog
              count={selectedKeys.size}
              accountId={accountId}
              accounts={accounts}
              categories={categories}
              payees={payees}
              projectNames={projectNames}
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
          projectNames={projectNames}
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
          projectNames={projectNames}
          updateGroup={updateGroup}
          selectedKeys={selectedKeys}
          onToggleSelected={toggleSelected}
          onToggleSelectAll={toggleSelectAll}
        />
      </div>
    );
  }

  return (
    <>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Importar extracto</CardTitle>
          <CardDescription>
            Sube un PDF de Bancolombia, RappiCard o Nu para revisar sus movimientos antes de importarlos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setUploadOpen(true)} className="self-start">
            <UploadIcon /> Importar extracto
          </Button>
        </CardContent>
      </Card>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importar extracto</DialogTitle>
            <DialogDescription>Selecciona el archivo y la cuenta a la que corresponde.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Extracto PDF (Bancolombia, RappiCard o Nu)</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </div>
            {file && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">¿A qué cuenta quieres cargarlo?</label>
                <Combobox
                  value={accountId}
                  onValueChange={(v) => v && setAccountId(v)}
                  items={Object.fromEntries(accounts.map((a) => [a.id, `${a.name} (${a.currency})`]))}
                  className="w-full"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleParse} disabled={isPending || !file || !accountId}>
              <UploadIcon /> Analizar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
  projectNames,
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
  projectNames: string[];
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
              <TableHead>Proyecto / Viaje</TableHead>
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
                projectNames={projectNames}
                updateGroup={updateGroup}
                selected={selectedKeys.has(g.key)}
                onToggleSelected={onToggleSelected}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const GroupRow = memo(function GroupRow({
  g,
  accountId,
  accounts,
  categories,
  payees,
  projectNames,
  updateGroup,
  selected,
  onToggleSelected,
}: {
  g: EditableGroup;
  accountId: string;
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  projectNames: string[];
  updateGroup: (key: string, patch: Partial<EditableGroup>) => void;
  selected: boolean;
  onToggleSelected: (key: string) => void;
}) {
  return (
    <TableRow className={g.skip ? "opacity-50" : undefined}>
      <TableCell>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected(g.key)}
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
        <Combobox
          value={g.typeChoice}
          onValueChange={(v) => v && updateGroup(g.key, { typeChoice: v as TransactionType })}
          items={labelItems(TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS)}
          className="h-7 w-full text-sm"
        />
      </TableCell>
      <TableCell className="min-w-[160px]">
        {g.typeChoice === "transfer" ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            <Combobox
              value={g.payeeChoice}
              onValueChange={(v) => v && updateGroup(g.key, { payeeChoice: v })}
              items={{
                none: "Sin payee",
                new: "+ Crear nuevo",
                ...Object.fromEntries(payees.map((p) => [p.id, p.name])),
              }}
              className="h-7 w-full text-sm"
            />
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
          <Combobox
            value={g.destinationChoice}
            onValueChange={(v) => v && updateGroup(g.key, { destinationChoice: v })}
            items={{
              none: "Sin especificar",
              ...Object.fromEntries(accounts.filter((a) => a.id !== accountId).map((a) => [a.id, a.name])),
            }}
            placeholder="Cuenta destino"
            className="h-7 w-full text-sm"
          />
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
      <TableCell className="min-w-[140px]">
        <Combobox
          value={g.projectTrip}
          onValueChange={(v) => v && updateGroup(g.key, { projectTrip: v })}
          items={projectTripItems(projectNames)}
          placeholder="Ninguno"
          className="h-7 w-full text-sm"
        />
      </TableCell>
      <TableCell>
        {g.typeChoice === "transfer" ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <input
            type="checkbox"
            checked={g.createRule}
            onChange={(e) => updateGroup(g.key, { createRule: e.target.checked })}
          />
        )}
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
});

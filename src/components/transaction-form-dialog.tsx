"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PlusIcon, SaveIcon, Trash2Icon, WandSparklesIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { CategorySelect } from "@/components/category-select";

import { createTransaction, updateTransaction, type SplitInput } from "@/app/transacciones/actions";
import { CreateRuleFromTransactionDialog } from "@/components/create-rule-from-transaction-dialog";
import { CURRENCIES, TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS } from "@/lib/enums";
import { toDateTimeInputValue } from "@/lib/date-input";
import { formatMoney } from "@/lib/format";
import { projectTripItems } from "@/lib/project-options";

const schema = z.object({
  date: z.string().min(1, "Requerido"),
  type: z.enum(TRANSACTION_TYPES),
  accountId: z.string().min(1, "Requerido"),
  destinationAccountId: z.string(),
  amountMinor: z.string().min(1, "Requerido"),
  currency: z.enum(CURRENCIES),
  destinationAmountMinor: z.string(),
  destinationCurrency: z.string(),
  categoryId: z.string(),
  payeeId: z.string(),
  description: z.string(),
  projectTrip: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

type Account = { id: string; name: string; currency: string };
type Category = { id: string; name: string; kind: string; parentCategoryId: string | null };
type Payee = { id: string; name: string };

type Transaction = {
  id: number;
  date: Date;
  type: string;
  accountId: string;
  destinationAccountId: string | null;
  amountMinor: number;
  currency: string;
  destinationAmountMinor: number | null;
  destinationCurrency: string | null;
  categoryId: string | null;
  payeeId: string | null;
  description: string | null;
  projectTrip: string | null;
  notes: string | null;
};

type ExistingSplit = {
  id: number;
  amountMinor: number;
  categoryId: string | null;
  payeeId: string | null;
  description: string | null;
};

// Form-local shape for a split row being edited — string amount (like the
// parent's own amountMinor field) and "none" sentinels, converted to
// `SplitInput` only at submit time.
type SplitRow = {
  key: string;
  amountMinor: string;
  categoryId: string;
  payeeId: string;
  description: string;
};

type UsualTransaction = {
  id: string;
  name: string;
  values: Omit<FormValues, "date" | "notes"> & { notes: string };
};

const USUAL_TRANSACTIONS_KEY = "finanbolsa:usual-transactions";

function splitRowsFromExisting(splits: ExistingSplit[]): SplitRow[] {
  return splits.map((s) => ({
    key: `existing-${s.id}`,
    amountMinor: String(s.amountMinor),
    categoryId: s.categoryId ?? "none",
    payeeId: s.payeeId ?? "none",
    description: s.description ?? "",
  }));
}

export function TransactionFormDialog({
  accounts,
  categories,
  payees,
  projectNames,
  transaction,
  splits = [],
  trigger,
}: {
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  projectNames: string[];
  transaction?: Transaction;
  splits?: ExistingSplit[];
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>(() => splitRowsFromExisting(splits));
  const [usualTransactions, setUsualTransactions] = useState<UsualTransaction[]>([]);
  const [usualName, setUsualName] = useState("");
  const [usualTransactionsLoaded, setUsualTransactionsLoaded] = useState(false);

  const emptyValues: FormValues = {
    date: toDateTimeInputValue(new Date()),
    type: "expense",
    accountId: accounts[0]?.id ?? "",
    destinationAccountId: "none",
    amountMinor: "",
    currency: accounts[0]?.currency as FormValues["currency"] ?? "COP",
    destinationAmountMinor: "",
    destinationCurrency: "none",
    categoryId: "none",
    payeeId: "none",
    description: "",
    projectTrip: "none",
    notes: "",
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...emptyValues,
      ...(transaction
        ? {
            date: toDateTimeInputValue(transaction.date),
            type: transaction.type as FormValues["type"],
            accountId: transaction.accountId,
            destinationAccountId: transaction.destinationAccountId ?? "none",
            amountMinor: String(transaction.amountMinor),
            currency: transaction.currency as FormValues["currency"],
            destinationAmountMinor:
              transaction.destinationAmountMinor != null ? String(transaction.destinationAmountMinor) : "",
            destinationCurrency: transaction.destinationCurrency ?? "none",
            categoryId: transaction.categoryId ?? "none",
            payeeId: transaction.payeeId ?? "none",
            description: transaction.description ?? "",
            projectTrip: transaction.projectTrip ?? "none",
            notes: transaction.notes ?? "",
          }
        : {}),
    },
  });

  useEffect(() => {
    if (transaction) return;
    const restore = () => {
      try {
        const saved = localStorage.getItem(USUAL_TRANSACTIONS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setUsualTransactions(parsed);
        }
      } catch {
        // Ignore malformed or inaccessible storage.
      }
      setUsualTransactionsLoaded(true);
    };
    const timeoutId = window.setTimeout(restore, 0);
    return () => window.clearTimeout(timeoutId);
  }, [transaction]);

  useEffect(() => {
    if (transaction || !usualTransactionsLoaded) return;
    try {
      localStorage.setItem(USUAL_TRANSACTIONS_KEY, JSON.stringify(usualTransactions));
    } catch {
      // Ignore storage write failures.
    }
  }, [transaction, usualTransactions, usualTransactionsLoaded]);

  const type = form.watch("type");
  const accountId = form.watch("accountId");
  const amountMinorStr = form.watch("amountMinor");
  const currency = form.watch("currency");
  const description = form.watch("description");
  const categoryId = form.watch("categoryId");
  const payeeId = form.watch("payeeId");
  const isTransfer = type === "transfer";
  const showSplits = !isTransfer && type === "expense";
  const canCreateRule = Boolean(description.trim()) && (categoryId !== "none" || payeeId !== "none");

  const splitTotal = splitRows.reduce((s, r) => s + (Number(r.amountMinor) || 0), 0);
  const remainder = (Number(amountMinorStr) || 0) - splitTotal;

  function onAccountChange(id: string | null, onChange: (v: string) => void) {
    if (!id) return;
    onChange(id);
    const account = accounts.find((a) => a.id === id);
    if (account) form.setValue("currency", account.currency as FormValues["currency"]);
  }

  function addSplitRow() {
    setSplitRows((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        amountMinor: remainder > 0 ? String(remainder) : "",
        categoryId: "none",
        payeeId: "none",
        description: "",
      },
    ]);
  }

  function updateSplitRow(key: string, patch: Partial<SplitRow>) {
    setSplitRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeSplitRow(key: string) {
    setSplitRows((prev) => prev.filter((r) => r.key !== key));
  }

  function saveUsualTransaction() {
    const name = usualName.trim();
    if (!name) {
      toast.error("Escribe un nombre para la transacción usual");
      return;
    }
    const values = { ...form.getValues() };
    Reflect.deleteProperty(values, "date");
    setUsualTransactions((current) => [
      ...current,
      { id: `usual-${Date.now()}`, name, values: values as UsualTransaction["values"] },
    ]);
    setUsualName("");
    toast.success("Transacción usual guardada");
  }

  function applyUsualTransaction(usual: UsualTransaction) {
    form.reset({
      ...usual.values,
      date: toDateTimeInputValue(new Date()),
    });
    setSplitRows([]);
  }

  function deleteUsualTransaction(id: string) {
    setUsualTransactions((current) => current.filter((usual) => usual.id !== id));
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const input = {
          date: new Date(values.date),
          type: values.type,
          accountId: values.accountId,
          destinationAccountId:
            values.type === "transfer" && values.destinationAccountId !== "none"
              ? values.destinationAccountId
              : null,
          amountMinor: Number(values.amountMinor),
          currency: values.currency,
          destinationAmountMinor:
            values.type === "transfer" && values.destinationAmountMinor
              ? Number(values.destinationAmountMinor)
              : null,
          destinationCurrency:
            values.type === "transfer" && values.destinationCurrency !== "none"
              ? (values.destinationCurrency as FormValues["currency"])
              : null,
          categoryId: values.type !== "transfer" && values.categoryId !== "none" ? values.categoryId : null,
          payeeId: values.type !== "transfer" && values.payeeId !== "none" ? values.payeeId : null,
          description: values.description || null,
          projectTrip: values.projectTrip !== "none" ? values.projectTrip : null,
          notes: values.notes || null,
        };
        // Only expense transactions can carry a breakdown — if the type got
        // switched away from expense, whatever's in splitRows is discarded
        // rather than persisted.
        const splitsInput: SplitInput[] = values.type === "expense"
          ? splitRows
              .filter((r) => Number(r.amountMinor) > 0)
              .map((r) => ({
                amountMinor: Number(r.amountMinor),
                categoryId: r.categoryId !== "none" ? r.categoryId : null,
                payeeId: r.payeeId !== "none" ? r.payeeId : null,
                description: r.description || null,
              }))
          : [];
        if (transaction) {
          await updateTransaction(transaction.id, input, splitsInput);
          toast.success("Transacción actualizada");
        } else {
          await createTransaction(input, splitsInput);
          toast.success("Transacción creada");
          form.reset();
          setSplitRows([]);
        }
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && !transaction) {
          form.reset({ ...emptyValues, date: toDateTimeInputValue(new Date()) });
          setSplitRows([]);
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{transaction ? "Editar transacción" : "Nueva transacción"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        items={Object.fromEntries(TRANSACTION_TYPES.map((t) => [t, TRANSACTION_TYPE_LABELS[t]]))}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={(v) => onAccountChange(v, field.onChange)}
                        items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {isTransfer ? (
                <FormField
                  control={form.control}
                  name="destinationAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cuenta destino</FormLabel>
                      <FormControl>
                        <Combobox
                          value={field.value}
                          onValueChange={field.onChange}
                          items={{
                            none: "Sin especificar",
                            ...Object.fromEntries(
                              accounts.filter((a) => a.id !== accountId).map((a) => [a.id, a.name])
                            ),
                          }}
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría</FormLabel>
                      <FormControl>
                        <CategorySelect
                          categories={categories}
                          value={field.value}
                          onValueChange={field.onChange}
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="amountMinor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moneda</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        items={Object.fromEntries(CURRENCIES.map((c) => [c, c]))}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isTransfer && (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="destinationAmountMinor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto destino (si cambia de moneda)</FormLabel>
                      <FormControl>
                        <Input type="number" step="any" placeholder="Opcional" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="destinationCurrency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moneda destino</FormLabel>
                      <FormControl>
                        <Combobox
                          value={field.value}
                          onValueChange={field.onChange}
                          items={{
                            none: "Igual a origen",
                            ...Object.fromEntries(CURRENCIES.map((c) => [c, c])),
                          }}
                          placeholder="Igual a origen"
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {!isTransfer && (
              <FormField
                control={form.control}
                name="payeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payee</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        items={{
                          none: "Sin payee",
                          ...Object.fromEntries(payees.map((p) => [p.id, p.name])),
                        }}
                        placeholder="Sin payee"
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="projectTrip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proyecto / Viaje</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        items={projectTripItems(projectNames, transaction?.projectTrip)}
                        placeholder="Ninguno"
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {showSplits && (
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Desglose (opcional)</span>
                  <Button type="button" variant="outline" size="sm" onClick={addSplitRow}>
                    <PlusIcon /> Agregar
                  </Button>
                </div>
                {splitRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Registra aquí gastos específicos dentro de este monto — por ejemplo, qué compraste con
                    parte de un retiro de efectivo.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      {splitRows.map((r) => (
                        <div key={r.key} className="flex flex-col gap-1.5 rounded-md bg-muted/40 p-2">
                          <div className="flex gap-1.5">
                            <Input
                              type="number"
                              step="any"
                              placeholder="Monto"
                              className="h-7 w-24 text-sm"
                              value={r.amountMinor}
                              onChange={(e) => updateSplitRow(r.key, { amountMinor: e.target.value })}
                            />
                            <Input
                              placeholder="Descripción"
                              className="h-7 flex-1 text-sm"
                              value={r.description}
                              onChange={(e) => updateSplitRow(r.key, { description: e.target.value })}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeSplitRow(r.key)}
                            >
                              <XIcon className="size-4" />
                              <span className="sr-only">Quitar</span>
                            </Button>
                          </div>
                          <div className="flex gap-1.5">
                            <CategorySelect
                              categories={categories}
                              value={r.categoryId}
                              onValueChange={(v) => updateSplitRow(r.key, { categoryId: v })}
                              kind="expense"
                              className="h-7 flex-1 text-sm"
                            />
                            <Combobox
                              value={r.payeeId}
                              onValueChange={(v) => updateSplitRow(r.key, { payeeId: v || "none" })}
                              items={{
                                none: "Sin payee",
                                ...Object.fromEntries(payees.map((p) => [p.id, p.name])),
                              }}
                              placeholder="Sin payee"
                              className="h-7 flex-1 text-sm"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Desglosado: {formatMoney(splitTotal, currency)} de{" "}
                      {formatMoney(Number(amountMinorStr) || 0, currency)}
                      {remainder !== 0 && ` · Sin desglosar: ${formatMoney(remainder, currency)}`}
                    </p>
                  </>
                )}
              </div>
            )}

            <DialogFooter className={transaction ? "sm:justify-between" : undefined}>
              {transaction && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canCreateRule}
                  onClick={() => setRuleDialogOpen(true)}
                >
                  <WandSparklesIcon /> Crear regla
                </Button>
              )}
              <Button type="submit" disabled={isPending}>
                {transaction ? "Guardar cambios" : "Crear transacción"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      {!transaction && open && (
        <DialogPortal>
          <aside className="fixed top-1/2 right-[max(1rem,calc(50%_-_560px))] z-50 hidden max-h-[min(720px,calc(100vh_-_2rem))] w-64 -translate-y-1/2 flex-col gap-3 overflow-hidden rounded-xl bg-popover p-3 text-sm text-popover-foreground ring-1 ring-foreground/10 xl:flex">
            <div>
              <h2 className="text-sm font-semibold">Transacciones usuales</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Guarda combinaciones frecuentes y aplícalas al formulario.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                value={usualName}
                onChange={(event) => setUsualName(event.target.value)}
                placeholder="Nombre"
                aria-label="Nombre de la transacción usual"
                className="h-8 min-w-0 text-xs"
              />
              <Button type="button" size="icon-sm" onClick={saveUsualTransaction} aria-label="Guardar transacción usual">
                <SaveIcon />
              </Button>
            </div>
            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
              {usualTransactions.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Aún no tienes transacciones usuales.
                </p>
              ) : (
                usualTransactions.map((usual) => (
                  <div key={usual.id} className="flex items-center gap-1 rounded-md border bg-background p-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto min-w-0 flex-1 justify-start truncate px-2 py-1.5 text-left text-xs"
                      onClick={() => applyUsualTransaction(usual)}
                      title="Aplicar al formulario"
                    >
                      {usual.name}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteUsualTransaction(usual.id)}
                      aria-label={`Eliminar ${usual.name}`}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </DialogPortal>
      )}

      {ruleDialogOpen && (
        <CreateRuleFromTransactionDialog
          onOpenChange={setRuleDialogOpen}
          description={description}
          categoryId={categoryId}
          payeeId={payeeId}
          categories={categories}
          payees={payees}
        />
      )}
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createTransaction, updateTransaction } from "@/app/transacciones/actions";
import { CURRENCIES, TRANSACTION_TYPES } from "@/lib/enums";
import { toDateTimeInputValue } from "@/lib/date-input";

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
type Category = { id: string; name: string; kind: string };
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

export function TransactionFormDialog({
  accounts,
  categories,
  payees,
  transaction,
  trigger,
}: {
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  transaction?: Transaction;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: toDateTimeInputValue(transaction?.date ?? new Date()),
      type: (transaction?.type as FormValues["type"]) ?? "expense",
      accountId: transaction?.accountId ?? accounts[0]?.id ?? "",
      destinationAccountId: transaction?.destinationAccountId ?? "none",
      amountMinor: transaction?.amountMinor != null ? String(transaction.amountMinor) : "",
      currency: (transaction?.currency as FormValues["currency"]) ?? accounts[0]?.currency ?? "COP",
      destinationAmountMinor:
        transaction?.destinationAmountMinor != null ? String(transaction.destinationAmountMinor) : "",
      destinationCurrency: transaction?.destinationCurrency ?? "none",
      categoryId: transaction?.categoryId ?? "none",
      payeeId: transaction?.payeeId ?? "none",
      description: transaction?.description ?? "",
      projectTrip: transaction?.projectTrip ?? "",
      notes: transaction?.notes ?? "",
    },
  });

  const type = form.watch("type");
  const accountId = form.watch("accountId");
  const isTransfer = type === "transfer";

  function onAccountChange(id: string | null, onChange: (v: string) => void) {
    if (!id) return;
    onChange(id);
    const account = accounts.find((a) => a.id === id);
    if (account) form.setValue("currency", account.currency as FormValues["currency"]);
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
          projectTrip: values.projectTrip || null,
          notes: values.notes || null,
        };
        if (transaction) {
          await updateTransaction(transaction.id, input);
          toast.success("Transacción actualizada");
        } else {
          await createTransaction(input);
          toast.success("Transacción creada");
          form.reset();
        }
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg">
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
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      items={Object.fromEntries(TRANSACTION_TYPES.map((t) => [t, t]))}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRANSACTION_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Select
                      value={field.value}
                      onValueChange={(v) => onAccountChange(v, field.onChange)}
                      items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        items={{
                          none: "Sin especificar",
                          ...Object.fromEntries(
                            accounts.filter((a) => a.id !== accountId).map((a) => [a.id, a.name])
                          ),
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
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
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        items={{
                          none: "Sin categoría",
                          ...Object.fromEntries(categories.map((c) => [c.id, c.name])),
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Sin categoría" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sin categoría</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      items={Object.fromEntries(CURRENCIES.map((c) => [c, c]))}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        items={{
                          none: "Igual a origen",
                          ...Object.fromEntries(CURRENCIES.map((c) => [c, c])),
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Igual a origen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Igual a origen</SelectItem>
                          {CURRENCIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      items={{
                        none: "Sin payee",
                        ...Object.fromEntries(payees.map((p) => [p.id, p.name])),
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Sin payee" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin payee</SelectItem>
                        {payees.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      <Input placeholder="Opcional" {...field} />
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

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {transaction ? "Guardar cambios" : "Crear transacción"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

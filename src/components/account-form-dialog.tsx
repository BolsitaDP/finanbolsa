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
import { Combobox } from "@/components/ui/combobox";

import { createAccount, updateAccount } from "@/app/cuentas/actions";
import { ACCOUNT_STATUSES, ACCOUNT_TYPES, CURRENCIES } from "@/lib/enums";
import { fromDateInputValue, toDateInputValue } from "@/lib/date-input";

const schema = z.object({
  name: z.string().min(1, "Requerido"),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.enum(CURRENCIES),
  creditLimitMinor: z.string(),
  status: z.enum(ACCOUNT_STATUSES),
  openedAt: z.string(),
  notes: z.string(),
  referenceDate: z.string().min(1, "Requerido"),
  referenceBalanceMinor: z.string().min(1, "Requerido"),
});

type FormValues = z.infer<typeof schema>;

type Account = {
  id: string;
  name: string;
  type: string;
  currency: string;
  creditLimitMinor: number | null;
  status: string;
  openedAt: Date | null;
  notes: string | null;
  referenceDate: Date;
  referenceBalanceMinor: number;
};

export function AccountFormDialog({
  account,
  trigger,
}: {
  account?: Account;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: account?.name ?? "",
      type: (account?.type as FormValues["type"]) ?? "bank",
      currency: (account?.currency as FormValues["currency"]) ?? "COP",
      creditLimitMinor: account?.creditLimitMinor != null ? String(account.creditLimitMinor) : "",
      status: (account?.status as FormValues["status"]) ?? "active",
      openedAt: toDateInputValue(account?.openedAt ?? null),
      notes: account?.notes ?? "",
      referenceDate: toDateInputValue(account?.referenceDate ?? new Date()),
      referenceBalanceMinor:
        account?.referenceBalanceMinor != null ? String(account.referenceBalanceMinor) : "0",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const input = {
          name: values.name,
          type: values.type,
          currency: values.currency,
          creditLimitMinor: values.creditLimitMinor ? Number(values.creditLimitMinor) : null,
          status: values.status,
          openedAt: values.openedAt ? fromDateInputValue(values.openedAt) : null,
          notes: values.notes || null,
          referenceDate: fromDateInputValue(values.referenceDate),
          referenceBalanceMinor: Number(values.referenceBalanceMinor),
        };
        if (account) {
          await updateAccount(account.id, input);
          toast.success("Cuenta actualizada");
        } else {
          await createAccount(input);
          toast.success("Cuenta creada");
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
          <DialogTitle>{account ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Bancolombia" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                        items={Object.fromEntries(ACCOUNT_TYPES.map((t) => [t, t.replace("_", " ")]))}
                        className="w-full"
                      />
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
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        items={Object.fromEntries(ACCOUNT_STATUSES.map((s) => [s, s]))}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="creditLimitMinor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cupo de crédito</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Opcional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="referenceDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de referencia</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="referenceBalanceMinor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Saldo de referencia</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="openedAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de apertura</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
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
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {account ? "Guardar cambios" : "Crear cuenta"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

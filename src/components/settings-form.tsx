"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";

import { updateSettings } from "@/app/configuracion/actions";
import { CURRENCIES } from "@/lib/enums";
import { fromDateInputValue, toDateInputValue } from "@/lib/date-input";

const schema = z.object({
  baseCurrency: z.enum(CURRENCIES),
  startDate: z.string().min(1, "Requerido"),
  owner: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function SettingsForm({
  baseCurrency,
  startDate,
  owner,
  notes,
}: {
  baseCurrency: string;
  startDate: Date;
  owner: string | null;
  notes: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      baseCurrency: baseCurrency as FormValues["baseCurrency"],
      startDate: toDateInputValue(startDate),
      owner: owner ?? "",
      notes: notes ?? "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        await updateSettings({
          baseCurrency: values.baseCurrency,
          startDate: fromDateInputValue(values.startDate),
          owner: values.owner || null,
          notes: values.notes || null,
        });
        toast.success("Configuración guardada");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="baseCurrency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Moneda base</FormLabel>
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
        <FormField
          control={form.control}
          name="startDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de inicio</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="owner"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Propietario</FormLabel>
              <FormControl>
                <Input {...field} />
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
        <Button type="submit" disabled={isPending} className="self-start">
          Guardar cambios
        </Button>
      </form>
    </Form>
  );
}

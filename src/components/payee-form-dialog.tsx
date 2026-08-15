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

import { createPayee, updatePayee } from "@/app/payees/actions";

const schema = z.object({
  name: z.string().min(1, "Requerido"),
  defaultCategoryId: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

type Category = { id: string; name: string; kind: string };

export function PayeeFormDialog({
  categories,
  payee,
  trigger,
}: {
  categories: Category[];
  payee?: { id: string; name: string; defaultCategoryId: string | null; notes: string | null };
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: payee?.name ?? "",
      defaultCategoryId: payee?.defaultCategoryId ?? "none",
      notes: payee?.notes ?? "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const input = {
          name: values.name,
          defaultCategoryId: values.defaultCategoryId === "none" ? null : values.defaultCategoryId,
          notes: values.notes || null,
        };
        if (payee) {
          await updatePayee(payee.id, input);
          toast.success("Payee actualizado");
        } else {
          await createPayee(input);
          toast.success("Payee creado");
          form.reset({ name: "", defaultCategoryId: "none", notes: "" });
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{payee ? "Editar payee" : "Nuevo payee"}</DialogTitle>
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
                    <Input placeholder="Ej. Rappi, Éxito, Netflix" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultCategoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría por defecto</FormLabel>
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
                {payee ? "Guardar cambios" : "Crear payee"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

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

import { createCategory, updateCategory } from "@/app/(app)/categorias/actions";
import { CATEGORY_KINDS, CATEGORY_STATUSES } from "@/lib/enums";

const schema = z.object({
  name: z.string().min(1, "Requerido"),
  parentCategoryId: z.string(),
  kind: z.enum(CATEGORY_KINDS),
  status: z.enum(CATEGORY_STATUSES),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

type Category = {
  id: string;
  name: string;
  parentCategoryId: string | null;
  kind: string;
  status: string;
  notes: string | null;
};

export function CategoryFormDialog({
  categories,
  category,
  trigger,
}: {
  categories: Category[];
  category?: Category;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? "",
      parentCategoryId: category?.parentCategoryId ?? "none",
      kind: (category?.kind as FormValues["kind"]) ?? "expense",
      status: (category?.status as FormValues["status"]) ?? "active",
      notes: category?.notes ?? "",
    },
  });

  const selectableParents = categories.filter(
    (c) => !category || c.id !== category.id
  );

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const input = {
          name: values.name,
          parentCategoryId: values.parentCategoryId === "none" ? null : values.parentCategoryId,
          kind: values.kind,
          status: values.status,
          notes: values.notes || null,
        };
        if (category) {
          await updateCategory(category.id, input);
          toast.success("Categoría actualizada");
        } else {
          await createCategory(input);
          toast.success("Categoría creada");
          form.reset({ name: "", parentCategoryId: "none", kind: "expense", status: "active", notes: "" });
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
          <DialogTitle>{category ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
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
                    <Input placeholder="Ej. Mascotas" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="parentCategoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría padre</FormLabel>
                  <FormControl>
                    <Combobox
                      value={field.value}
                      onValueChange={field.onChange}
                      items={{
                        none: "Ninguna (categoría principal)",
                        ...Object.fromEntries(selectableParents.map((c) => [c.id, c.name])),
                      }}
                      placeholder="Ninguna"
                      className="w-full"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        items={Object.fromEntries(CATEGORY_KINDS.map((k) => [k, k]))}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                        items={Object.fromEntries(CATEGORY_STATUSES.map((s) => [s, s]))}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
                {category ? "Guardar cambios" : "Crear categoría"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

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

import { createProject, updateProject } from "@/app/(app)/proyectos/actions";
import { toDateInputValue, fromDateInputValue } from "@/lib/date-input";

const PROJECT_TYPES = { project: "Proyecto", trip: "Viaje" } as const;

const PROJECT_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-green-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
  "bg-rose-500",
];

const schema = z.object({
  name: z.string().min(1, "Requerido"),
  type: z.enum(["project", "trip"]),
  color: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

type Project = {
  id: string;
  name: string;
  type: string;
  color: string | null;
  startDate: Date | null;
  endDate: Date | null;
  notes: string | null;
};

export function ProjectFormDialog({
  project,
  trigger,
}: {
  project?: Project;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: project?.name ?? "",
      type: (project?.type as FormValues["type"]) ?? "project",
      color: project?.color ?? "none",
      startDate: toDateInputValue(project?.startDate ?? null),
      endDate: toDateInputValue(project?.endDate ?? null),
      notes: project?.notes ?? "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const input = {
          name: values.name,
          type: values.type,
          color: values.color !== "none" ? values.color : null,
          startDate: values.startDate ? fromDateInputValue(values.startDate) : null,
          endDate: values.endDate ? fromDateInputValue(values.endDate) : null,
          notes: values.notes || null,
        };
        if (project) {
          await updateProject(project.id, input);
          toast.success("Proyecto/viaje actualizado");
        } else {
          await createProject(input);
          toast.success("Proyecto/viaje creado");
          form.reset({ name: "", type: "project", color: "none", startDate: "", endDate: "", notes: "" });
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
          <DialogTitle>{project ? "Editar proyecto/viaje" : "Nuevo proyecto/viaje"}</DialogTitle>
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
                    <Input placeholder="Ej. Viaje a Madrid" {...field} />
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
                        items={PROJECT_TYPES}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        items={{
                          none: "Sin color",
                          ...Object.fromEntries(
                            PROJECT_COLORS.map((c) => [c, c.replace("bg-", "").replace("-500", "")])
                          ),
                        }}
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
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha inicio</FormLabel>
                    <FormControl>
                      <Input type="date" placeholder="Opcional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha fin</FormLabel>
                    <FormControl>
                      <Input type="date" placeholder="Opcional" {...field} />
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
                    <Input placeholder="Opcional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {project ? "Guardar cambios" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

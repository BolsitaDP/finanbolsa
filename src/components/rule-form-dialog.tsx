"use client";

import { useState, useTransition } from "react";
import { useFieldArray, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createRule, updateRule } from "@/app/reglas/actions";
import { RULE_FIELDS, RULE_OPS, type RuleAction, type RuleCondition } from "@/lib/rules-types";

const conditionSchema = z.object({
  field: z.enum(RULE_FIELDS),
  op: z.enum(RULE_OPS),
  value: z.string().min(1, "Requerido"),
});

const actionSchema = z.object({
  field: z.enum(["categoryId", "payeeId"]),
  value: z.string().min(1, "Requerido"),
});

const schema = z.object({
  name: z.string(),
  conditions: z.array(conditionSchema).min(1, "Agrega al menos una condición"),
  actions: z.array(actionSchema).min(1, "Agrega al menos una acción"),
});

type FormValues = z.infer<typeof schema>;

type Category = { id: string; name: string };
type Payee = { id: string; name: string };
type Account = { id: string; name: string };

const FIELD_LABELS: Record<(typeof RULE_FIELDS)[number], string> = {
  description: "Descripción",
  payeeId: "Payee",
  accountId: "Cuenta",
  amountMinor: "Monto",
};

export function RuleFormDialog({
  categories,
  payees,
  accounts,
  rule,
  trigger,
}: {
  categories: Category[];
  payees: Payee[];
  accounts: Account[];
  rule?: {
    id: number;
    name: string | null;
    conditions: RuleCondition[];
    actions: RuleAction[];
  };
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: rule?.name ?? "",
      conditions: rule?.conditions ?? [{ field: "description", op: "contains", value: "" }],
      actions: rule?.actions ?? [{ field: "categoryId", value: "" }],
    },
  });

  const conditionFields = useFieldArray({ control: form.control, name: "conditions" });
  const actionFields = useFieldArray({ control: form.control, name: "actions" });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const input = {
          name: values.name || null,
          conditions: values.conditions,
          actions: values.actions,
        };
        if (rule) {
          await updateRule(rule.id, input);
          toast.success("Regla actualizada");
        } else {
          await createRule(input);
          toast.success("Regla creada");
          form.reset({
            name: "",
            conditions: [{ field: "description", op: "contains", value: "" }],
            actions: [{ field: "categoryId", value: "" }],
          });
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
          <DialogTitle>{rule ? "Editar regla" : "Nueva regla"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input placeholder="Nombre de la regla (opcional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-muted-foreground">
                Si se cumplen todas estas condiciones
              </div>
              {conditionFields.fields.map((f, i) => (
                <ConditionRow
                  key={f.id}
                  index={i}
                  payees={payees}
                  accounts={accounts}
                  onRemove={
                    conditionFields.fields.length > 1
                      ? () => conditionFields.remove(i)
                      : undefined
                  }
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  conditionFields.append({ field: "description", op: "contains", value: "" })
                }
              >
                <PlusIcon /> Agregar condición
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-muted-foreground">Entonces</div>
              {actionFields.fields.map((f, i) => (
                <ActionRow
                  key={f.id}
                  index={i}
                  categories={categories}
                  payees={payees}
                  onRemove={
                    actionFields.fields.length > 1 ? () => actionFields.remove(i) : undefined
                  }
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => actionFields.append({ field: "categoryId", value: "" })}
              >
                <PlusIcon /> Agregar acción
              </Button>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {rule ? "Guardar cambios" : "Crear regla"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ConditionRow({
  index,
  payees,
  accounts,
  onRemove,
}: {
  index: number;
  payees: Payee[];
  accounts: Account[];
  onRemove?: () => void;
}) {
  const form = useFormContext<FormValues>();
  const fieldType = form.watch(`conditions.${index}.field`);

  return (
    <div className="flex items-start gap-1.5">
      <FormField
        control={form.control}
        name={`conditions.${index}.field`}
        render={({ field }) => (
          <Select
            value={field.value}
            onValueChange={field.onChange}
            items={Object.fromEntries(RULE_FIELDS.map((f) => [f, FIELD_LABELS[f]]))}
          >
            <SelectTrigger className="w-28 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_FIELDS.map((f) => (
                <SelectItem key={f} value={f}>
                  {FIELD_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FormField
        control={form.control}
        name={`conditions.${index}.op`}
        render={({ field }) => (
          <Select
            value={field.value}
            onValueChange={field.onChange}
            items={Object.fromEntries(RULE_OPS.map((op) => [op, op === "contains" ? "contiene" : "es"]))}
          >
            <SelectTrigger className="w-24 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_OPS.map((op) => (
                <SelectItem key={op} value={op}>
                  {op === "contains" ? "contiene" : "es"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FormField
        control={form.control}
        name={`conditions.${index}.value`}
        render={({ field }) => (
          <FormItem className="min-w-0 flex-1">
            <FormControl>
              {fieldType === "accountId" ? (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : fieldType === "payeeId" ? (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  items={Object.fromEntries(payees.map((p) => [p.id, p.name]))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Payee" />
                  </SelectTrigger>
                  <SelectContent>
                    {payees.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="Valor" {...field} />
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {onRemove && (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove}>
          <Trash2Icon />
        </Button>
      )}
    </div>
  );
}

function ActionRow({
  index,
  categories,
  payees,
  onRemove,
}: {
  index: number;
  categories: Category[];
  payees: Payee[];
  onRemove?: () => void;
}) {
  const form = useFormContext<FormValues>();
  const fieldType = form.watch(`actions.${index}.field`);
  const options = fieldType === "payeeId" ? payees : categories;

  return (
    <div className="flex items-start gap-1.5">
      <FormField
        control={form.control}
        name={`actions.${index}.field`}
        render={({ field }) => (
          <Select
            value={field.value}
            onValueChange={field.onChange}
            items={{ categoryId: "Categoría", payeeId: "Payee" }}
          >
            <SelectTrigger className="w-32 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="categoryId">Categoría</SelectItem>
              <SelectItem value="payeeId">Payee</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
      <FormField
        control={form.control}
        name={`actions.${index}.value`}
        render={({ field }) => (
          <FormItem className="min-w-0 flex-1">
            <FormControl>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                items={Object.fromEntries(options.map((o) => [o.id, o.name]))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {onRemove && (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove}>
          <Trash2Icon />
        </Button>
      )}
    </div>
  );
}

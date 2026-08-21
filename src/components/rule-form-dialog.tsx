"use client";

import { useEffect, useState, useTransition } from "react";
import { useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
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
import { Combobox } from "@/components/ui/combobox";
import { CategorySelect } from "@/components/category-select";

import { createRule, previewRuleMatches, updateRule, type RulePreviewSample } from "@/app/reglas/actions";
import {
  OPS_BY_FIELD,
  RULE_FIELDS,
  RULE_MATCH_TYPES,
  RULE_OPS,
  type RuleAction,
  type RuleCondition,
  type RuleMatchType,
} from "@/lib/rules-types";
import { formatDate, formatMoney } from "@/lib/format";

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
  matchType: z.enum(RULE_MATCH_TYPES),
  conditions: z.array(conditionSchema).min(1, "Agrega al menos una condición"),
  actions: z.array(actionSchema).min(1, "Agrega al menos una acción"),
});

type FormValues = z.infer<typeof schema>;

type Category = { id: string; name: string; kind: string; parentCategoryId: string | null };
type Payee = { id: string; name: string };
type Account = { id: string; name: string };

const FIELD_LABELS: Record<(typeof RULE_FIELDS)[number], string> = {
  description: "Descripción",
  payeeId: "Payee",
  accountId: "Cuenta",
  amountMinor: "Monto",
};

const OP_LABELS: Record<(typeof RULE_OPS)[number], string> = {
  contains: "contiene",
  not_contains: "no contiene",
  starts_with: "empieza con",
  ends_with: "termina con",
  equals: "es",
  not_equals: "no es",
  greater_than: "mayor que",
  greater_or_equal: "mayor o igual a",
  less_than: "menor que",
  less_or_equal: "menor o igual a",
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
    matchType: string;
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
      matchType: (rule?.matchType as RuleMatchType) ?? "all",
      conditions: rule?.conditions ?? [{ field: "description", op: "contains", value: "" }],
      actions: rule?.actions ?? [{ field: "categoryId", value: "" }],
    },
  });

  const conditionFields = useFieldArray({ control: form.control, name: "conditions" });
  const actionFields = useFieldArray({ control: form.control, name: "actions" });

  const watchedConditions = useWatch({ control: form.control, name: "conditions" });
  const watchedMatchType = useWatch({ control: form.control, name: "matchType" });
  const validConditions = watchedConditions.filter((c) => c.value.trim() !== "");
  const [preview, setPreview] = useState<{ count: number; sample: RulePreviewSample[] } | null>(null);
  const [previewPending, startPreviewTransition] = useTransition();

  // Live dry-run: shows how many existing transactions this rule (as
  // currently being edited) would match, so overlap with existing rules or
  // an overly broad/narrow pattern is visible before saving — debounced so
  // it doesn't hit the server on every keystroke. Rendering below is gated
  // on validConditions.length, so a stale `preview` value from before the
  // last condition was cleared just never gets shown — no need to reset it
  // here (which would mean calling setState synchronously in the effect).
  useEffect(() => {
    if (!open || validConditions.length === 0) return;
    const handle = setTimeout(() => {
      startPreviewTransition(async () => {
        const result = await previewRuleMatches(validConditions as RuleCondition[], watchedMatchType);
        setPreview(result);
      });
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(watchedConditions), watchedMatchType]);

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const input = {
          name: values.name || null,
          matchType: values.matchType,
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
            matchType: "all",
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPreview(null);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-xl">
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
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span>Si se cumplen</span>
                <FormField
                  control={form.control}
                  name="matchType"
                  render={({ field }) => (
                    <Combobox
                      value={field.value}
                      onValueChange={field.onChange}
                      items={{ all: "todas", any: "alguna" }}
                      className="h-6 w-24 text-xs"
                    />
                  )}
                />
                <span>de estas condiciones</span>
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

              {validConditions.length > 0 && preview && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                  <div className={`font-medium ${previewPending ? "opacity-50" : ""}`}>
                    {preview.count === 0
                      ? "No coincide con ninguna transacción actual."
                      : `Coincide con ${preview.count} ${preview.count === 1 ? "transacción actual" : "transacciones actuales"}`}
                  </div>
                  {preview.sample.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                      {preview.sample.map((s, i) => (
                        <li key={i} className="truncate">
                          {formatDate(new Date(s.date))} · {s.description ?? "—"} ·{" "}
                          {formatMoney(s.amountMinor, s.currency)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {preview.count > preview.sample.length && (
                    <div className="mt-1 text-muted-foreground">
                      y {preview.count - preview.sample.length} más...
                    </div>
                  )}
                </div>
              )}
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
  const availableOps = OPS_BY_FIELD[fieldType];

  return (
    <div className="flex items-start gap-1.5">
      <FormField
        control={form.control}
        name={`conditions.${index}.field`}
        render={({ field }) => (
          <Combobox
            value={field.value}
            onValueChange={(v) => {
              if (!v) return;
              field.onChange(v);
              // The op may not be valid for the newly-selected field (e.g.
              // "empieza con" doesn't apply to Monto) — fall back to the
              // first op that does.
              const validOps = OPS_BY_FIELD[v as (typeof RULE_FIELDS)[number]];
              const currentOp = form.getValues(`conditions.${index}.op`);
              if (!validOps.includes(currentOp)) {
                form.setValue(`conditions.${index}.op`, validOps[0]);
              }
            }}
            items={Object.fromEntries(RULE_FIELDS.map((f) => [f, FIELD_LABELS[f]]))}
            className="w-28 shrink-0"
          />
        )}
      />
      <FormField
        control={form.control}
        name={`conditions.${index}.op`}
        render={({ field }) => (
          <Combobox
            value={field.value}
            onValueChange={field.onChange}
            items={Object.fromEntries(availableOps.map((op) => [op, OP_LABELS[op]]))}
            className="w-36 shrink-0"
          />
        )}
      />
      <FormField
        control={form.control}
        name={`conditions.${index}.value`}
        render={({ field }) => (
          <FormItem className="min-w-0 flex-1">
            <FormControl>
              {fieldType === "accountId" ? (
                <Combobox
                  value={field.value}
                  onValueChange={field.onChange}
                  items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
                  placeholder="Cuenta"
                  className="w-full"
                />
              ) : fieldType === "payeeId" ? (
                <Combobox
                  value={field.value}
                  onValueChange={field.onChange}
                  items={Object.fromEntries(payees.map((p) => [p.id, p.name]))}
                  placeholder="Payee"
                  className="w-full"
                />
              ) : (
                <Input
                  type={fieldType === "amountMinor" ? "number" : "text"}
                  step={fieldType === "amountMinor" ? "any" : undefined}
                  placeholder="Valor"
                  {...field}
                />
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

  return (
    <div className="flex items-start gap-1.5">
      <FormField
        control={form.control}
        name={`actions.${index}.field`}
        render={({ field }) => (
          <Combobox
            value={field.value}
            onValueChange={field.onChange}
            items={{ categoryId: "Categoría", payeeId: "Payee" }}
            className="w-32 shrink-0"
          />
        )}
      />
      <FormField
        control={form.control}
        name={`actions.${index}.value`}
        render={({ field }) => (
          <FormItem className="min-w-0 flex-1">
            <FormControl>
              {fieldType === "categoryId" ? (
                <CategorySelect
                  categories={categories}
                  value={field.value}
                  onValueChange={field.onChange}
                  includeNone={false}
                  noneLabel="Selecciona..."
                  className="w-full"
                />
              ) : (
                <Combobox
                  value={field.value}
                  onValueChange={field.onChange}
                  items={Object.fromEntries(payees.map((p) => [p.id, p.name]))}
                  className="w-full"
                />
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

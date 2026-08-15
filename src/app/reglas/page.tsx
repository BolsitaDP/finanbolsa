import { asc } from "drizzle-orm";
import { PencilIcon, PlusIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, categories, payees, rules } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RuleFormDialog } from "@/components/rule-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { ApplyRulesButton } from "@/components/apply-rules-button";
import { ToggleRuleButton } from "@/components/toggle-rule-button";
import { deleteRule } from "./actions";
import type { RuleField } from "@/lib/rules-types";

const FIELD_LABELS: Record<RuleField, string> = {
  description: "descripción",
  payeeId: "payee",
  accountId: "cuenta",
  amountMinor: "monto",
};

export default async function ReglasPage() {
  const [allRules, allCategories, allPayees, allAccounts] = await Promise.all([
    db.select().from(rules).orderBy(asc(rules.sortOrder)),
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(payees).orderBy(asc(payees.name)),
    db.select().from(accounts).orderBy(asc(accounts.name)),
  ]);

  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const payeeName = new Map(allPayees.map((p) => [p.id, p.name]));

  function describeCondition(c: { field: RuleField; op: string; value: string }) {
    const label =
      c.field === "payeeId"
        ? payeeName.get(c.value) ?? c.value
        : c.field === "accountId"
          ? allAccounts.find((a) => a.id === c.value)?.name ?? c.value
          : c.value;
    return `${FIELD_LABELS[c.field]} ${c.op === "contains" ? "contiene" : "es"} "${label}"`;
  }

  function describeAction(a: { field: string; value: string }) {
    const label = a.field === "payeeId" ? payeeName.get(a.value) : categoryName.get(a.value);
    return `${a.field === "payeeId" ? "payee" : "categoría"} = ${label ?? a.value}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reglas</h1>
          <p className="text-sm text-muted-foreground">
            Auto-categorización de transacciones por patrones.
          </p>
        </div>
        <div className="flex gap-2">
          <ApplyRulesButton />
          <RuleFormDialog
            categories={allCategories}
            payees={allPayees}
            accounts={allAccounts}
            trigger={
              <Button size="sm">
                <PlusIcon /> Nueva regla
              </Button>
            }
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{allRules.length} reglas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Si</TableHead>
                <TableHead>Entonces</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allRules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name ?? `Regla #${r.id}`}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.conditions.map(describeCondition).join(" y ")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.actions.map(describeAction).join(", ")}
                  </TableCell>
                  <TableCell>
                    <ToggleRuleButton id={r.id} enabled={r.enabled} />
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <RuleFormDialog
                      categories={allCategories}
                      payees={allPayees}
                      accounts={allAccounts}
                      rule={r}
                      trigger={
                        <Button variant="ghost" size="icon-sm">
                          <PencilIcon />
                          <span className="sr-only">Editar</span>
                        </Button>
                      }
                    />
                    <DeleteButton
                      action={deleteRule.bind(null, r.id)}
                      confirmMessage={`¿Eliminar la regla "${r.name ?? `#${r.id}`}"?`}
                      successMessage="Regla eliminada"
                    />
                  </TableCell>
                </TableRow>
              ))}
              {allRules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Aún no hay reglas. Crea la primera.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

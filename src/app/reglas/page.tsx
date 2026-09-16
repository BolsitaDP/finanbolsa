import { asc } from "drizzle-orm";
import { PlusIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, categories, payees, rules } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RuleFormDialog } from "@/components/rule-form-dialog";
import { ApplyRulesButton } from "@/components/apply-rules-button";
import { ReglasTable } from "@/components/reglas-table";
import type { RuleField, RuleOp } from "@/lib/rules-types";

const FIELD_LABELS: Record<RuleField, string> = {
  description: "descripción",
  payeeId: "payee",
  accountId: "cuenta",
  amountMinor: "monto",
};

const OP_LABELS: Record<RuleOp, string> = {
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

// Reads live data with no dynamic API to force Next to treat it as such —
// see the comment in src/app/configuracion/page.tsx for why this matters.
export const dynamic = "force-dynamic";

export default async function ReglasPage() {
  const [allRules, allCategories, allPayees, allAccounts] = await Promise.all([
    db.select().from(rules).orderBy(asc(rules.sortOrder)),
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(payees).orderBy(asc(payees.name)),
    db.select().from(accounts).orderBy(asc(accounts.name)),
  ]);

  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const payeeName = new Map(allPayees.map((p) => [p.id, p.name]));
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));

  function describeCondition(c: { field: RuleField; op: string; value: string }) {
    const label =
      c.field === "payeeId"
        ? (payeeName.get(c.value) ?? c.value)
        : c.field === "accountId"
          ? (accountName.get(c.value) ?? c.value)
          : c.value;
    return `${FIELD_LABELS[c.field]} ${OP_LABELS[c.op as RuleOp]} "${label}"`;
  }

  function describeAction(a: { field: string; value: string }) {
    const label = a.field === "payeeId" ? payeeName.get(a.value) : categoryName.get(a.value);
    return `${a.field === "payeeId" ? "payee" : "categoría"} = ${label ?? a.value}`;
  }

  const rows = allRules.map((r) => ({
    ...r,
    conditionsText: r.conditions.map(describeCondition).join(r.matchType === "any" ? " o " : " y "),
    actionsText: r.actions.map(describeAction).join(", "),
  }));

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
          <ReglasTable rules={rows} categories={allCategories} payees={allPayees} accounts={allAccounts} />
        </CardContent>
      </Card>
    </div>
  );
}

import { eq } from "drizzle-orm";
import { FileJson, FileSpreadsheet, FileText } from "lucide-react";

import { db } from "@/db";
import { accounts, budgets, categories, payees, rules, settings, transactions } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SettingsForm } from "@/components/settings-form";
import { DangerZone } from "@/components/danger-zone";
import { ImportHistoryCard } from "@/components/import-history-card";
import { getImportBatches } from "@/app/(app)/importar/actions";
import {
  resetAccounts,
  resetAllExceptAccounts,
  resetBudgets,
  resetCategories,
  resetPayees,
  resetRules,
  resetTransactions,
} from "./actions";

// This page reads live counts straight from the database with no dynamic
// API (searchParams, cookies, etc.) to signal that to Next automatically —
// without this, it gets statically prerendered once at build time (when the
// database has no schema yet in a fresh Docker build) and would otherwise
// keep serving that stale snapshot in production instead of live data.
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const [s, txCount, catCount, payeeCount, ruleCount, budgetCount, accountCount, importBatches] =
    await Promise.all([
      db.select().from(settings).where(eq(settings.id, "default")).then((r) => r[0]),
      db.select({ id: transactions.id }).from(transactions).then((r) => r.length),
      db.select({ id: categories.id }).from(categories).then((r) => r.length),
      db.select({ id: payees.id }).from(payees).then((r) => r.length),
      db.select({ id: rules.id }).from(rules).then((r) => r.length),
      db.select({ id: budgets.id }).from(budgets).then((r) => r.length),
      db.select({ id: accounts.id }).from(accounts).then((r) => r.length),
      getImportBatches(),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">Datos generales de la app.</p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm
            baseCurrency={s?.baseCurrency ?? "COP"}
            startDate={s?.startDate ?? new Date()}
            owner={s?.owner ?? null}
            notes={s?.notes ?? null}
          />
          <p className="mt-4 text-xs text-muted-foreground">
            Versión de schema: {s?.schemaVersion ?? "—"}
          </p>
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Exportar datos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Descarga un respaldo de tus datos — antes de usar la zona de peligro, o para llevarlos a
            otra parte.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/export?format=json" />}>
            <FileJson /> JSON — respaldo completo
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/export?format=csv" />}>
            <FileText /> CSV — transacciones
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/export?format=xlsx" />}>
            <FileSpreadsheet /> Excel — todo en un libro
          </Button>
        </CardContent>
      </Card>

      <ImportHistoryCard
        batches={importBatches}
        emptyMessage="Aún no has importado ningún extracto — el historial aparecerá aquí después de tu primera importación."
      />

      <Card className="max-w-md border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Zona de peligro</CardTitle>
          <p className="text-sm text-muted-foreground">
            Borra datos para empezar de cero. Cada acción pide confirmación escrita y no se puede
            deshacer.
          </p>
        </CardHeader>
        <CardContent>
          <DangerZone
            txCount={txCount}
            budgetCount={budgetCount}
            ruleCount={ruleCount}
            payeeCount={payeeCount}
            catCount={catCount}
            accountCount={accountCount}
            resetTransactions={resetTransactions}
            resetBudgets={resetBudgets}
            resetRules={resetRules}
            resetPayees={resetPayees}
            resetCategories={resetCategories}
            resetAccounts={resetAccounts}
            resetAllExceptAccounts={resetAllExceptAccounts}
          />
        </CardContent>
      </Card>
    </div>
  );
}

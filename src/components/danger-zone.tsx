"use client";

import { Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DangerConfirmDialog } from "@/components/danger-confirm-dialog";

type ResetAllResult = {
  transactions: number;
  budgets: number;
  rules: number;
  payees: number;
  categories: number;
};

export function DangerZone({
  txCount,
  budgetCount,
  ruleCount,
  payeeCount,
  catCount,
  accountCount,
  resetTransactions,
  resetBudgets,
  resetRules,
  resetPayees,
  resetCategories,
  resetAccounts,
  resetAllExceptAccounts,
}: {
  txCount: number;
  budgetCount: number;
  ruleCount: number;
  payeeCount: number;
  catCount: number;
  accountCount: number;
  resetTransactions: () => Promise<number>;
  resetBudgets: () => Promise<number>;
  resetRules: () => Promise<number>;
  resetPayees: () => Promise<number>;
  resetCategories: () => Promise<number>;
  resetAccounts: () => Promise<number>;
  resetAllExceptAccounts: () => Promise<ResetAllResult>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <DangerRow
        label={`Transacciones (${txCount})`}
        title="Eliminar todas las transacciones"
        description="Se eliminarán todas las transacciones. Las cuentas, categorías, payees y reglas no se tocan."
        confirmWord="ELIMINAR"
        action={resetTransactions}
        onDone={(n) => `${n} transacciones eliminadas`}
      />
      <DangerRow
        label={`Presupuesto (${budgetCount})`}
        title="Eliminar todo el presupuesto"
        description="Se eliminarán todos los montos presupuestados de todos los meses."
        confirmWord="ELIMINAR"
        action={resetBudgets}
        onDone={(n) => `${n} registros de presupuesto eliminados`}
      />
      <DangerRow
        label={`Reglas (${ruleCount})`}
        title="Eliminar todas las reglas"
        description="Se eliminarán todas las reglas de auto-categorización."
        confirmWord="ELIMINAR"
        action={resetRules}
        onDone={(n) => `${n} reglas eliminadas`}
      />
      <DangerRow
        label={`Payees (${payeeCount})`}
        title="Eliminar todos los payees"
        description="Se eliminarán todos los payees. Las transacciones que los referenciaban quedarán sin payee."
        confirmWord="ELIMINAR"
        action={resetPayees}
        onDone={(n) => `${n} payees eliminados`}
      />
      <DangerRow
        label={`Categorías (${catCount})`}
        title="Eliminar todas las categorías"
        description="Se eliminarán todas las categorías y el presupuesto asociado. Las transacciones y payees quedarán sin categoría."
        confirmWord="ELIMINAR"
        action={resetCategories}
        onDone={(n) => `${n} categorías eliminadas`}
      />
      <DangerRow
        label={`Cuentas (${accountCount})`}
        title="Eliminar todas las cuentas"
        description="Se eliminarán todas las cuentas y, con ellas, TODAS las transacciones (una transacción no puede existir sin cuenta)."
        confirmWord="ELIMINAR CUENTAS"
        action={resetAccounts}
        onDone={(n) => `${n} cuentas eliminadas`}
      />

      <div className="mt-2 border-t pt-3">
        <DangerConfirmDialog
          trigger={
            <Button variant="destructive" size="sm">
              <Trash2Icon /> Restablecer todo (excepto cuentas)
            </Button>
          }
          title="Restablecer todo excepto cuentas"
          description="Se eliminarán transacciones, presupuesto, reglas, payees y categorías. Las cuentas se conservan."
          confirmWord="RESTABLECER"
          action={resetAllExceptAccounts}
          onDone={(r) =>
            `Listo: ${r.transactions} transacciones, ${r.categories} categorías, ${r.payees} payees, ${r.rules} reglas y ${r.budgets} registros de presupuesto eliminados`
          }
        />
      </div>
    </div>
  );
}

function DangerRow({
  label,
  title,
  description,
  confirmWord,
  action,
  onDone,
}: {
  label: string;
  title: string;
  description: string;
  confirmWord: string;
  action: () => Promise<number>;
  onDone: (result: number) => string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <DangerConfirmDialog
        trigger={
          <Button variant="outline" size="sm">
            Eliminar
          </Button>
        }
        title={title}
        description={description}
        confirmWord={confirmWord}
        action={action}
        onDone={onDone}
      />
    </div>
  );
}

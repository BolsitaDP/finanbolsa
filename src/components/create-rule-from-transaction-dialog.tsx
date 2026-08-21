"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { CategorySelect } from "@/components/category-select";

import { createRuleFromTransaction } from "@/app/reglas/actions";
import { cleanMerchantName } from "@/lib/merchant";

type Category = { id: string; name: string; kind: string; parentCategoryId: string | null };
type Payee = { id: string; name: string };

// Only ever mounted while it should be open (see transaction-form-dialog.tsx),
// so the initial state below always reflects the transaction that triggered it.
export function CreateRuleFromTransactionDialog({
  onOpenChange,
  description,
  categoryId,
  payeeId,
  categories,
  payees,
}: {
  onOpenChange: (open: boolean) => void;
  description: string;
  categoryId: string;
  payeeId: string;
  categories: Category[];
  payees: Payee[];
}) {
  const [condition, setCondition] = useState(() => cleanMerchantName(description));
  const [category, setCategory] = useState(categoryId);
  const [payee, setPayee] = useState(payeeId);
  const [isPending, startTransition] = useTransition();
  const canConfirm = Boolean(condition.trim()) && (category !== "none" || payee !== "none");

  function handleConfirm() {
    startTransition(async () => {
      try {
        const { merchantLabel } = await createRuleFromTransaction({
          merchantLabel: condition,
          categoryId: category !== "none" ? category : null,
          payeeId: payee !== "none" ? payee : null,
        });
        toast.success(`Regla creada para "${merchantLabel}"`);
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al crear la regla");
      }
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" forceOverlay>
        <DialogHeader>
          <DialogTitle>Crear regla</DialogTitle>
          <DialogDescription>
            Las próximas transacciones cuya descripción contenga esto se categorizarán así automáticamente.
            Revisa y confirma antes de guardarla.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">La descripción contiene</label>
            <Input value={condition} onChange={(e) => setCondition(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Categoría</label>
            <CategorySelect
              categories={categories}
              value={category}
              onValueChange={setCategory}
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Payee</label>
            <Combobox
              value={payee}
              onValueChange={(v) => setPayee(v || "none")}
              items={{ none: "Sin payee", ...Object.fromEntries(payees.map((p) => [p.id, p.name])) }}
              placeholder="Sin payee"
              className="w-full"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={isPending || !canConfirm} onClick={handleConfirm}>
            Confirmar y crear regla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

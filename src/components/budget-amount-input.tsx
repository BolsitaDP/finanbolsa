"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { setBudgetAmount } from "@/app/presupuesto/actions";

export function BudgetAmountInput({
  categoryId,
  month,
  initial,
}: {
  categoryId: string;
  month: string;
  initial: number;
}) {
  const [value, setValue] = useState(initial ? String(initial) : "");
  const [isPending, startTransition] = useTransition();

  function commit() {
    const amount = Number(value) || 0;
    if (amount === initial) return;
    startTransition(async () => {
      try {
        await setBudgetAmount(categoryId, month, amount);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar");
      }
    });
  }

  return (
    <Input
      type="number"
      inputMode="decimal"
      className="w-32 text-right"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      disabled={isPending}
    />
  );
}

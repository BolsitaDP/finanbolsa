"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { setBudgetAmount } from "@/app/(app)/presupuesto/actions";

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
  // MonthSwitcher changes `?month=`, the server re-renders with a new
  // `initial`, and this component is reused rather than remounted — so without
  // adopting the new value it kept showing the PREVIOUS month's amount, and
  // typing into it then wrote that stale number into the new month. Adjusting
  // during render (React's documented pattern for state tracking a prop) avoids
  // the extra paint that doing it in an effect would cause.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setValue(initial ? String(initial) : "");
  }
  const [isPending, startTransition] = useTransition();

  function commit() {
    const amount = Number(value) || 0;
    if (amount === initial) return;
    startTransition(async () => {
      try {
        await setBudgetAmount(categoryId, month, amount);
        // Silence on success left the user unsure whether the edit saved, which
        // matters here because the field is edited on blur with no other cue.
        toast.success("Presupuesto guardado");
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

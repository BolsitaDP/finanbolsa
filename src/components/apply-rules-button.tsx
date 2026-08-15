"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { PlayIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { applyRulesToTransactions } from "@/app/reglas/actions";

export function ApplyRulesButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          try {
            const { updated, total } = await applyRulesToTransactions();
            toast.success(`${updated} de ${total} transacciones actualizadas`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al aplicar reglas");
          }
        })
      }
    >
      <PlayIcon /> Aplicar a transacciones existentes
    </Button>
  );
}

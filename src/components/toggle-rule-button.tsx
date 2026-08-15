"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { toggleRuleEnabled } from "@/app/reglas/actions";

export function ToggleRuleButton({ id, enabled }: { id: number; enabled: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          try {
            await toggleRuleEnabled(id, !enabled);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        })
      }
    >
      <Badge variant={enabled ? "secondary" : "outline"}>
        {enabled ? "activa" : "inactiva"}
      </Badge>
    </button>
  );
}

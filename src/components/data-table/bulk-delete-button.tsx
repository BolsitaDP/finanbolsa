"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function BulkDeleteButton({
  count,
  action,
  confirmMessage,
  successMessage,
  onDone,
}: {
  count: number;
  action: () => Promise<void>;
  confirmMessage: string;
  successMessage: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm(confirmMessage)) return;
    startTransition(async () => {
      try {
        await action();
        toast.success(successMessage);
        onDone();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
      }
    });
  }

  return (
    <Button variant="destructive" size="sm" onClick={handleClick} disabled={isPending}>
      <Trash2Icon /> Eliminar ({count})
    </Button>
  );
}

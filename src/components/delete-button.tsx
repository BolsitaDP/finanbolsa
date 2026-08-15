"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DeleteButton({
  action,
  confirmMessage,
  successMessage,
}: {
  action: () => Promise<void>;
  confirmMessage: string;
  successMessage: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm(confirmMessage)) return;
    startTransition(async () => {
      try {
        await action();
        toast.success(successMessage);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
      }
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" disabled={isPending} onClick={handleClick}>
      <Trash2Icon />
      <span className="sr-only">Eliminar</span>
    </Button>
  );
}

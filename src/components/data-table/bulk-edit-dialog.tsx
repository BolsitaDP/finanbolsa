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
  DialogTrigger,
} from "@/components/ui/dialog";

export function BulkEditDialog({
  trigger,
  title,
  count,
  onApply,
  children,
}: {
  trigger: React.ReactElement;
  title: string;
  count: number;
  onApply: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleApply() {
    startTransition(async () => {
      try {
        await onApply();
        toast.success("Cambios aplicados");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al aplicar cambios");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Activa los campos que quieras cambiar — el resto no se toca. Se aplicará a {count}{" "}
            {count === 1 ? "elemento seleccionado" : "elementos seleccionados"}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">{children}</div>
        <DialogFooter>
          <Button onClick={handleApply} disabled={isPending}>
            Aplicar a {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

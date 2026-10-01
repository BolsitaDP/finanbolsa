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
  onClosed,
  blockedReason,
  notice,
  children,
}: {
  trigger: React.ReactElement;
  title: string;
  count: number;
  onApply: () => Promise<void>;
  /** Called when the dialog closes, so the caller can clear its field state. */
  onClosed?: () => void;
  /** When set, "Aplicar" is disabled and this explains why. */
  blockedReason?: string | null;
  /** A non-blocking warning rendered above the fields. */
  notice?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const blocked = Boolean(blockedReason);

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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset the field state on close. Otherwise reopening the dialog shows
        // every checkbox still ticked from last time, and "Aplicar" then writes
        // a patch the user never chose in this session.
        if (!next) onClosed?.();
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Activa los campos que quieras cambiar — el resto no se toca. Se aplicará a {count}{" "}
            {count === 1 ? "elemento seleccionado" : "elementos seleccionados"}.
          </DialogDescription>
        </DialogHeader>
        {notice}
        <div className="flex flex-col gap-4">{children}</div>
        <DialogFooter>
          <Button onClick={handleApply} disabled={isPending || blocked}>
            Aplicar a {count}
          </Button>
        </DialogFooter>
        {blocked ? <p className="text-sm text-destructive">{blockedReason}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

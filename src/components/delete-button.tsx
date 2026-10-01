"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2Icon, Undo2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Delete with an undo window instead of a confirmation dialog.
 *
 * A confirm dialog asks the user to predict whether they'll want it back, and
 * they usually can't know. An undo window answers the question that actually
 * matters — "did I mean to do that?" — *after* the fact, when they do know.
 *
 * `onUndo` is what makes the undo real rather than decorative. Rows are soft
 * deleted, so restoring is a matter of clearing `deletedAt`; the danger zone
 * still confirms, because that genuinely cannot be undone.
 */
export function DeleteButton({
  action,
  onUndo,
  confirmMessage,
  successMessage = "Eliminado",
  label,
}: {
  action: () => Promise<void>;
  /** Called when the user clicks "Deshacer". Omit to keep a confirm dialog. */
  onUndo?: () => Promise<void>;
  confirmMessage: string;
  successMessage?: string;
  /** What was deleted, e.g. `"la transacción"`. Used in the toast. */
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<void>, okMessage: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(okMessage);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
      }
    });
  }

  function handleClick() {
    if (!onUndo) {
      if (!window.confirm(confirmMessage)) return;
      run(action, successMessage);
      return;
    }
    run(action, successMessage);
    toast(successMessage, {
      description: label ? `Se eliminó ${label}.` : undefined,
      duration: 8000,
      action: {
        label: "Deshacer",
        onClick: () => run(onUndo, "Restaurado"),
      },
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" disabled={isPending} onClick={handleClick}>
      <Trash2Icon />
      <span className="sr-only">Eliminar</span>
    </Button>
  );
}

/**
 * Bulk variant: same undo window, with the count so the message is specific.
 */
export function BulkDeleteWithUndoButton({
  count,
  action,
  onUndo,
  successMessage,
  onDone,
}: {
  count: number;
  action: () => Promise<void>;
  onUndo: () => Promise<void>;
  successMessage: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await action();
        onDone();
        toast.success(successMessage, {
          duration: 8000,
          action: {
            label: "Deshacer",
            onClick: () =>
              startTransition(async () => {
                try {
                  await onUndo();
                  toast.success("Restaurado");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "No se pudo restaurar");
                }
              }),
          },
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
      }
    });
  }

  return (
    <Button variant="destructive" size="sm" onClick={handleClick} disabled={isPending}>
      <Trash2Icon /> Eliminar ({count})
      {isPending ? null : <Undo2Icon className="sr-only" />}
    </Button>
  );
}

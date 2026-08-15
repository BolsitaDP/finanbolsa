"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangleIcon } from "lucide-react";

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
import { Input } from "@/components/ui/input";

export function DangerConfirmDialog<T>({
  trigger,
  title,
  description,
  confirmWord,
  action,
  onDone,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmWord: string;
  action: () => Promise<T>;
  onDone: (result: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        const result = await action();
        toast.success(onDone(result));
        setOpen(false);
        setValue("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al eliminar");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setValue("");
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangleIcon className="size-5" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm">
            Escribe <span className="font-mono font-semibold">{confirmWord}</span> para confirmar
          </label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={value !== confirmWord || isPending}
            onClick={handleConfirm}
          >
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

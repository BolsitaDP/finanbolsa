"use client";

import { useTransition } from "react";
import { ArchiveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { archiveAccount } from "@/app/(app)/cuentas/actions";

/**
 * Archives an account instead of deleting it.
 *
 * Offered whenever an account has transactions: `transactions.account_id` is
 * NOT NULL with a foreign key, so a hard delete can only ever fail once history
 * exists, and it used to fail with a raw SQLite error in English. Archiving
 * keeps the history and takes the account out of the active set, which is what
 * you want for a closed account anyway.
 */
export function ArchiveButton({ accountId, name }: { accountId: string; name: string }) {
  const [isPending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      try {
        await archiveAccount(accountId);
        toast.success(`"${name}" archivada`, {
          description: "Su historial se conserva. Puedes reactivarla desde Editar.",
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo archivar");
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={archive}
      disabled={isPending}
      title={`Archivar "${name}"`}
    >
      <ArchiveIcon />
      <span className="sr-only">Archivar</span>
    </Button>
  );
}

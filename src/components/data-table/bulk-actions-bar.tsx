import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function BulkActionsBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
      <span className="text-sm font-medium whitespace-nowrap">{count} seleccionados</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
        Cancelar selección
      </Button>
    </div>
  );
}

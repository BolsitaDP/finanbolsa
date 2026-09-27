"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ArchiveIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { bulkUpdateCategories } from "@/app/(app)/categorias/actions";

export function CategoryArchiveSuggestion({
  categoryId,
  monthsSinceLastTx,
}: {
  categoryId: string;
  monthsSinceLastTx: number;
}) {
  const [isPending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      try {
        await bulkUpdateCategories([categoryId], { status: "archived" });
        toast.success("Categoría archivada");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al archivar");
      }
    });
  }

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-warning">
          <TriangleAlertIcon className="size-4" />
          Sin actividad hace {monthsSinceLastTx} meses
        </CardTitle>
        <CardDescription>
          Esta categoría no tiene transacciones recientes — puede que ya no la necesites. Archivarla la
          saca de los selectores sin borrar su historial.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" size="sm" disabled={isPending} onClick={archive}>
          <ArchiveIcon /> Archivar categoría
        </Button>
      </CardContent>
    </Card>
  );
}

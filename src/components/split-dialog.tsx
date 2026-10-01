"use client";

import { useState, useTransition } from "react";
import { PlusIcon, ScissorsIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { CategorySelect } from "@/components/category-select";
import { setTransactionSplits, type SplitInput } from "@/app/(app)/transacciones/actions";
import { findOversplit } from "@/lib/schemas";
import { formatMoney } from "@/lib/format";
import type { RecentSplit } from "@/lib/aggregates";

/**
 * "Desglosar" en la fila — ROADMAP §2.3.
 *
 * Un retiro de efectivo es un solo movimiento de 300.000. Semanas después uno se
 * acuerda de que 120.000 fue mercado y 80.000 una cena, y hasta entonces esa plata
 * está en una sola categoría que no dice nada. El desglose ya existía, pero
 * **dentro del diálogo completo de transacción**: para llegar había que abrir la
 * fila, mover el deslizador de scrolls y añadir la primera línea. Para una
 * operación que se hace cada semana, esa es la fricción que hace que no se haga.
 *
 * No es un atajo al formulario, y esa es la diferencia: aquí solo hay un campo
 * por línea y el resto del movimiento no se toca. La acción escribe únicamente
 * los splits, precisamente para que una corrección hecha en otra pestaña no
 * pueda ser pisada con una copia vieja de la fila.
 */

type Row = { key: string; amountMinor: string; categoryId: string; payeeId: string };

function rowFromExisting(split: { amountMinor: number; categoryId: string | null; payeeId: string | null }): Row {
  return {
    key: `s-${split.categoryId ?? "none"}-${split.payeeId ?? "none"}`,
    amountMinor: String(split.amountMinor),
    categoryId: split.categoryId ?? "none",
    payeeId: split.payeeId ?? "none",
  };
}

let nextKey = 0;

export function SplitDialog({
  transaction,
  existingSplits,
  categories,
  payeeNames,
  suggestions,
  trigger,
}: {
  transaction: { id: number; amountMinor: number; currency: string; description: string | null };
  existingSplits: { amountMinor: number; categoryId: string | null; payeeId: string | null }[];
  categories: { id: string; name: string; kind: string; parentCategoryId: string | null }[];
  payeeNames: Map<string, string>;
  suggestions: RecentSplit[];
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  /**
   * El estado se arma al ABRIR, no al montar. El componente vive dentro de la
   * tabla y se renderiza una vez por fila, así que un `useState` inicial correría
   * una sola vez para todas y reabrir el diálogo mostraría el desglose
   * que se compuso la vez anterior. Reiniciar en el manejador —y no en un
   * efecto— además evita el render en cascada que un `setState` dentro de un
   * efecto produce.
   */
  function initialRows(): Row[] {
    return existingSplits.length > 0
      ? existingSplits.map(rowFromExisting)
      : [{ key: `n-${nextKey++}`, amountMinor: "", categoryId: "none", payeeId: "none" }];
  }

  const [current, setCurrent] = useState<Row[]>([]);

  const splitTotal = current.reduce((s, r) => s + (Number(r.amountMinor) || 0), 0);
  const remainder = transaction.amountMinor - splitTotal;
  // La misma comprobación que hace el servidor, y por el mismo motivo: el saldo
  // de las categorías tiene que cuadrar con el movimiento antes de escribir, no
  // después de que un toast lo diga.
  const oversplit = findOversplit(
    current.map((r) => ({ amountMinor: Number(r.amountMinor) || 0 })),
    transaction.amountMinor
  );
  const usable = current.filter((r) => Number(r.amountMinor) > 0);
  const canSave = !isPending && usable.length > 0 && !oversplit;

  function save() {
    const payload: SplitInput[] = usable.map((r) => ({
      amountMinor: Number(r.amountMinor),
      categoryId: r.categoryId === "none" ? null : r.categoryId,
      payeeId: r.payeeId === "none" ? null : r.payeeId,
      description: null,
    }));
    startTransition(async () => {
      try {
        await setTransactionSplits(transaction.id, payload);
        toast.success(
          payload.length === 0
            ? "Desglose quitado"
            : `Desglose guardado: ${formatMoney(splitTotal, transaction.currency)} en ${payload.length} ${payload.length === 1 ? "categoría" : "categorías"}`
        );
        setCurrent([]);
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo guardar el desglose.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setCurrent(next ? initialRows() : []);
        setOpen(next);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScissorsIcon className="size-4" />
            Desglosar {formatMoney(transaction.amountMinor, transaction.currency)}
          </DialogTitle>
          <DialogDescription>
            Reparte este movimiento entre varias categorías. El movimiento y su saldo no cambian:
            el desglose solo dice en qué se fue cada parte.
          </DialogDescription>
        </DialogHeader>

        {suggestions.length > 0 && current.filter((r) => Number(r.amountMinor) > 0).length === 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <span className="text-sm font-medium">Desgloses que ya usaste</span>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <Button
                  key={`${s.categoryId}-${s.payeeId}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrent([
                      ...current,
                      {
                        key: `n-${nextKey++}`,
                        amountMinor: String(remainder > 0 ? remainder : ""),
                        categoryId: s.categoryId ?? "none",
                        payeeId: s.payeeId ?? "none",
                      },
                    ])
                  }
                >
                  {s.categoryId ? (categories.find((c) => c.id === s.categoryId)?.name ?? s.categoryId) : "Sin categoría"}
                  {s.payeeId ? ` · ${payeeNames.get(s.payeeId) ?? s.payeeId}` : ""}
                  <Badge variant="secondary" className="ml-1">
                    {s.uses}×
                  </Badge>
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {current.map((row, index) => (
            <div key={row.key} className="flex items-end gap-2">
              <div className="flex-1">
                <span className="text-xs text-muted-foreground">Categoría</span>
                <CategorySelect
                  categories={categories}
                  value={row.categoryId}
                  onValueChange={(v) =>
                    setCurrent(current.map((r, i) => (i === index ? { ...r, categoryId: v } : r)))
                  }
                  className="w-full"
                />
              </div>
              <div className="w-40">
                <span className="text-xs text-muted-foreground">Monto</span>
                <Input
                  type="number"
                  step="any"
                  value={row.amountMinor}
                  onChange={(e) =>
                    setCurrent(
                      current.map((r, i) => (i === index ? { ...r, amountMinor: e.target.value } : r))
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Quitar esta línea"
                onClick={() => setCurrent(current.filter((_, i) => i !== index))}
              >
                <Trash2Icon />
                <span className="sr-only">Quitar línea</span>
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              setCurrent([
                ...current,
                {
                  key: `n-${nextKey++}`,
                  amountMinor: String(remainder > 0 ? remainder : ""),
                  categoryId: "none",
                  payeeId: "none",
                },
              ])
            }
          >
            <PlusIcon data-icon="inline-start" />
            Agregar categoría
          </Button>
        </div>

        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">
            {usable.length === 0
              ? "Sin montos aún"
              : `Desglosado ${formatMoney(splitTotal, transaction.currency)}`}
          </span>
          <span className={remainder < 0 ? "font-medium text-destructive" : "font-medium"}>
            {remainder >= 0
              ? `Sin desglosar: ${formatMoney(remainder, transaction.currency)}`
              : `Se pasa por ${formatMoney(Math.abs(remainder), transaction.currency)}`}
          </span>
        </div>

        {oversplit && (
          <p className="text-sm text-destructive">
            El desglose suma {formatMoney(oversplit.splitTotal, transaction.currency)} y el movimiento
            es de {formatMoney(transaction.amountMinor, transaction.currency)}. Un desglose mueve
            plata entre categorías, no la crea.
          </p>
        )}

        <DialogFooter>
          {existingSplits.length > 0 && (
            <Button variant="ghost" onClick={save} disabled={isPending}>
              Quitar el desglose
            </Button>
          )}
          <Button onClick={save} disabled={!canSave}>
            Guardar desglose
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

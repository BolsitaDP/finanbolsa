"use client";

import { useState, useTransition } from "react";
import { CalendarPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createRecurringCharge } from "@/app/(app)/transacciones/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import type { PlannedCharge } from "@/lib/recurring-template";

/**
 * "Registrar el de este mes" — ROADMAP §2.2.
 *
 * El paso que convierte el informe en herramienta. La fecha, el monto, la cuenta
 * y la categoría ya se sabían por el historial, así que el botón quita trabajo en
 * lugar de añadirlo: lo único que se escribe es confirmar.
 *
 * No es un atajo al formulario, y esa es la diferencia. Abrir el diálogo de
 * transacción para un cargo cuya fecha y monto ya son conocidos sería arrancar
 * la tarea más frecuente de la app con nueve campos por llenar. Y no crea
 * movimientos futuros: eso restaría saldo de un día que todavía no ocurrió, que
 * es el bug que `recurring-template.ts` documenta.
 */
export function RecurringChargeButton({ charge }: { charge: PlannedCharge }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending || done}
      title={
        charge.dateNote === "clamped-to-month-end"
          ? `Se cobra el ${charge.date.getDate()} porque este mes no tiene día ${charge.date.getDate() + 1}`
          : undefined
      }
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await createRecurringCharge({
              date: charge.date,
              amountMinor: charge.amountMinor,
              currency: charge.currency as Parameters<typeof createRecurringCharge>[0]["currency"],
              accountId: charge.accountId!,
              categoryId: charge.categoryId,
              payeeId: charge.payeeId,
              description: charge.description,
            });
            if (!result.created) {
              // El servidor lo vuelve a comprobar; si alguien lo capturó a mano
              // entre que se dibujó el botón y el clic, esto es lo correcto y no
              // un error.
              toast.info("Ese cargo ya está registrado este mes.");
              setDone(true);
              return;
            }
            toast.success(
              `${charge.description} registrado — ${formatMoney(charge.amountMinor, charge.currency)}, ${formatDate(charge.date)}`
            );
            setDone(true);
            router.refresh();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo registrar el cargo.");
          }
        })
      }
    >
      <CalendarPlusIcon data-icon="inline-start" />
      {done ? "Registrado" : "Registrar el de este mes"}
    </Button>
  );
}

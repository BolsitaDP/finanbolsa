"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BanIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { dismissRecurring, restoreRecurring } from "@/app/(app)/recurrentes/actions";

/**
 * "Esto no es una suscripción" — ROADMAP §2.2.
 *
 * Con el umbral actual, cualquier cosa que aparezca en tres meses con montos
 * parecidos entra. Sin una salida para los falsos positivos la lista solo crece y
 * el usuario aprende a ojearla, que es exactamente lo contrario de lo que
 * sirven la alerta de subida y la proyección que están dos tarjetas más arriba.
 *
 * Se confirma en vez de desaparecer en silencio: un clic que borra algo de una
 * lista de informe sin avisar se lee como un fallo de la app. Y deshacer está en
 * la misma página, porque un descarte equivocado es tan fácil de cometer como un
 * acierto.
 */
export function DismissRecurringButton({
  groupKey,
  label,
}: {
  groupKey: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={isPending}
      title={`"${label}" no es una suscripción: quitarla de esta lista`}
      onClick={() =>
        startTransition(async () => {
          try {
            await dismissRecurring(groupKey);
            toast.success(`${label} ya no aparece como recurrente.`, {
              description: "Puedes volver a incluirlo desde abajo.",
              action: { label: "Deshacer", onClick: () => restoreRecurring(groupKey) },
            });
            router.refresh();
          } catch {
            toast.error("No se pudo quitar de la lista.");
          }
        })
      }
    >
      <BanIcon />
      <span className="sr-only">Quitar {label} de la lista de recurrentes</span>
    </Button>
  );
}

/**
 * "Recuperar las N que quitaste".
 *
 * Los descartes se guardan y no caducan a propósito —"no es una suscripción" es
 * una afirmación sobre el comercio, no sobre un periodo—, así que sin esto
 * quitar algo por error sería irreversible desde la interfaz. El mensaje dice
 * cuántos son y qué se van a recuperar, para que el clic no sea a ciegas.
 */
export function RestoreDismissedButton({ keys, labels }: { keys: string[]; labels: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (keys.length === 0) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      className="self-start text-muted-foreground"
      onClick={() =>
        startTransition(async () => {
          try {
            await Promise.all(keys.map((key) => restoreRecurring(key)));
            toast.success(`${keys.length} ${keys.length === 1 ? "recurrente quitado" : "recurrentes quitados"} de vuelta en la lista.`);
            router.refresh();
          } catch {
            toast.error("No se pudieron recuperar.");
          }
        })
      }
    >
      {`Recuperar ${labels.length === 1 ? labels[0] : `${keys.length} descartados`}`}
    </Button>
  );
}

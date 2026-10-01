"use client";

import { useState, useTransition } from "react";
import { PlusIcon, Trash2Icon, CopyIcon, DownloadIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Combobox,
} from "@/components/ui/combobox";
import { CURRENCIES, type Currency } from "@/lib/enums";
import {
  copyRatesForward,
  deleteRate,
  refreshRatesFromTrm,
  saveRate,
  setConvertCurrency,
} from "@/app/(app)/configuracion/rates-actions";

type Row = {
  id: number;
  month: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  note: string | null;
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ExchangeRatesCard({
  rates,
  baseCurrency,
  convertCurrency,
  suggestedPairs,
}: {
  rates: Row[];
  baseCurrency: string;
  /** Whether conversion is switched on at all. */
  convertCurrency: boolean;
  /** (month, currency) pairs present in the data — what "Actualizar" fills. */
  suggestedPairs: { month: string; currency: string }[];
}) {
  const [month, setMonth] = useState(currentMonth());
  const [from, setFrom] = useState<Currency>("USD");
  const [to, setTo] = useState<Currency>(baseCurrency as Currency);
  const [rate, setRate] = useState("");
  const [copyFrom, setCopyFrom] = useState(currentMonth());
  const [isPending, startTransition] = useTransition();

  const others = CURRENCIES.filter((c) => c !== baseCurrency);

  function submit() {
    const value = Number(rate);
    if (!(value > 0)) {
      toast.error("La tasa debe ser un número mayor que cero.");
      return;
    }
    startTransition(async () => {
      try {
        await saveRate({ month, fromCurrency: from, toCurrency: to, rate: value });
        toast.success(`Tasa ${from} → ${to} guardada para ${month}`);
        setRate("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar");
      }
    });
  }

  /**
   * Pulls the official TRM average for every month that has foreign-currency
   * movements. This is what removes the recurring chore: once, then the app
   * only needs a refresh when a new month passes.
   */
  function refresh() {
    if (suggestedPairs.length === 0) return;
    startTransition(async () => {
      try {
        const result = await refreshRatesFromTrm(suggestedPairs);
        const parts: string[] = [];
        if (result.saved > 0) parts.push(`${result.saved} tasa${result.saved === 1 ? "" : "s"}`);
        if (result.alreadyThere > 0) parts.push(`${result.alreadyThere} ya estaban`);
        if (result.noData.length > 0) parts.push(`${result.noData.length} sin datos`);
        toast.success(
          parts.length > 0 ? `TRM actualizada: ${parts.join(", ")}` : "No había tasas nuevas que traer."
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar la TRM");
      }
    });
  }
  function toggleConversion() {
    startTransition(async () => {
      try {
        await setConvertCurrency(!convertCurrency);
        toast.success(
          convertCurrency
            ? "Los montos se muestran por moneda, sin convertir"
            : "Los montos en otras monedas se convertirán a " + baseCurrency
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo cambiar la opción");
      }
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      try {
        await deleteRate(id);
        toast.success("Tasa eliminada");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
      }
    });
  }

  function copy() {
    startTransition(async () => {
      try {
        const created = await copyRatesForward(copyFrom, month);
        toast.success(
          created > 0
            ? `Se copiaron ${created} tasa${created === 1 ? "" : "s"} a ${month}`
            : "No había tasas nuevas que copiar; las de ${month} ya existían."
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo copiar");
      }
    });
  }

  return (
    <Card id="tasas">
      <CardHeader>
        <CardTitle>Tasas de cambio</CardTitle>
        <CardDescription>
          Una tasa dice cuántas unidades de <strong>{to}</strong> vale una de{" "}
          <strong>{from}</strong>, para un mes. Se usan para sumar gastos e ingresos
          en otras monedas dentro del presupuesto y calcular tu patrimonio en{" "}
          {baseCurrency}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* The choice comes first, because it decides whether anything below
            matters. Off, the rest of this card is dormant and the budget just
            reports per currency. */}
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Convertir a {baseCurrency}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {convertCurrency
                ? "Los montos en otras monedas se convierten para poder sumarlos. Si a un mes le falta la tasa, ese mes queda fuera y te lo aviso."
                : "Apagado: los montos en otras monedas se muestran por separado y no se suman. No se te pide ninguna tasa."
              }
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={toggleConversion} disabled={isPending}>
              {convertCurrency ? "Apagar" : "Activar"}
            </Button>
            <Button onClick={refresh} disabled={isPending}>
              <DownloadIcon /> Actualizar TRM
            </Button>
          </div>
        </div>

        {suggestedPairs.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Hay movimientos en otras monedas en {suggestedPairs.length}{" "}
            {suggestedPairs.length === 1 ? "mes" : "meses"}. &quot;Actualizar TRM&quot; trae el promedio de
            cada uno desde la fuente oficial, y no toca las tasas que hayas puesto a mano.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rate-month">Mes</Label>
            <Input
              id="rate-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>De</Label>
            <Combobox
              value={from}
              onValueChange={(v) => setFrom(v as Currency)}
              items={Object.fromEntries(others.map((c) => [c, c]))}
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>A</Label>
            <Combobox
              value={to}
              onValueChange={(v) => setTo(v as Currency)}
              items={Object.fromEntries(CURRENCIES.map((c) => [c, c]))}
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rate-value">Tasa</Label>
            <Input
              id="rate-value"
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="4000"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={submit} disabled={isPending} className="w-full">
              <PlusIcon /> Guardar
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Ejemplo: si 1 USD = 4.000 COP, guarda <strong>USD → COP = 4000</strong>. El sentido
          inverso se calcula solo.
        </p>

        {rates.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No hay tasas registradas. Mientras no haya ninguna, los movimientos en otras
            monedas quedan fuera de los totales en {baseCurrency} — y el presupuesto te lo
            avisa en vez de ocultarlo.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Mes</th>
                  <th className="px-3 py-2 text-left font-medium">De</th>
                  <th className="px-3 py-2 text-left font-medium">A</th>
                  <th className="px-3 py-2 text-right font-medium">Tasa</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-3 py-2 tabular-nums">{r.month}</td>
                    <td className="px-3 py-2">{r.fromCurrency}</td>
                    <td className="px-3 py-2">{r.toCurrency}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.rate.toLocaleString("es-CO", { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(r.id)}
                        disabled={isPending}
                      >
                        <Trash2Icon />
                        <span className="sr-only">Eliminar tasa</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="copy-from">Copiar tasas de</Label>
            <Input
              id="copy-from"
              type="month"
              className="w-40"
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="copy-to">a {month}</Label>
            <Input id="copy-to" value={month} readOnly className="w-40" />
          </div>
          <Button variant="outline" onClick={copy} disabled={isPending}>
            <CopyIcon /> Copiar
          </Button>
          <p className="text-xs text-muted-foreground">
            Copia las últimas tasas conocidas hacia {month}. No sobrescribe las que ya
            existan allí.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

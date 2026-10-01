"use server";

import { and, asc, eq, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { saveSettings } from "@/lib/settings-store";
import { exchangeRates } from "@/db/schema";
import { buildRateIndex, type RateIndex, type RateRow } from "@/lib/currency";
import { fetchMonthlyAverageTrm, TRM_CURRENCIES } from "@/lib/trm";
import { settings } from "@/db/schema";
import { CURRENCIES, type Currency } from "@/lib/enums";

type RateInput = {
  month: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  rate: number;
  note?: string | null;
};

/**
 * The whole rate table, as a lookup.
 *
 * Tiny by design (one row per currency pair per month) so pages can read it
 * once and convert many amounts without a query per transaction.
 */
export async function getRateIndex(): Promise<RateIndex> {
  const rows = (await db.select().from(exchangeRates)) as RateRow[];
  return buildRateIndex(rows);
}

export async function listRates() {
  return db
    .select()
    .from(exchangeRates)
    .orderBy(asc(exchangeRates.month), asc(exchangeRates.fromCurrency));
}

/**
 * Upserts one rate.
 *
 * Upsert rather than insert because the same pair is re-entered whenever the
 * TRM is corrected, and a duplicate would make "which rate applies" ambiguous
 * for whichever month the first one covers.
 */
export async function saveRate(input: RateInput) {
  if (input.fromCurrency === input.toCurrency) {
    throw new Error("La moneda de origen y la de destino deben ser distintas.");
  }
  if (!(input.rate > 0)) {
    throw new Error("La tasa debe ser un número mayor que cero.");
  }
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    throw new Error("El mes no tiene un formato válido.");
  }
  if (!CURRENCIES.includes(input.fromCurrency) || !CURRENCIES.includes(input.toCurrency)) {
    throw new Error("Moneda no reconocida.");
  }

  await db
    .insert(exchangeRates)
    .values({
      month: input.month,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      rate: input.rate,
      note: input.note || null,
    })
    .onConflictDoUpdate({
      target: [exchangeRates.month, exchangeRates.fromCurrency, exchangeRates.toCurrency],
      set: { rate: input.rate, note: input.note || null },
    });

  revalidatePath("/configuracion");
  revalidatePath("/presupuesto");
  revalidatePath("/");
}

export async function deleteRate(id: number) {
  await db.delete(exchangeRates).where(eq(exchangeRates.id, id));
  revalidatePath("/configuracion");
  revalidatePath("/presupuesto");
  revalidatePath("/");
}

/**
 * Copies a month of rates forward, for the common "the TRM barely moved, copy
 * last month's" case. Only creates pairs that don't already exist in the target
 * month, so it never overwrites something the user entered deliberately.
 *
 * Returns how many were created so the UI can report it rather than leaving the
 * user guessing whether anything happened.
 */
export async function copyRatesForward(fromMonth: string, toMonth: string) {
  if (fromMonth >= toMonth) {
    throw new Error("El mes destino debe ser posterior al de origen.");
  }
  const source = await db
    .select()
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.toCurrency, "COP"),
        lte(exchangeRates.month, fromMonth)
      )
    )
    .orderBy(asc(exchangeRates.month));

  // The latest row per pair, up to the source month.
  const latest = new Map<string, number>();
  for (const row of source) latest.set(`${row.fromCurrency}>${row.toCurrency}`, row.rate);

  let created = 0;
  for (const [pair, rate] of latest) {
    const [from, to] = pair.split(">");
    const existing = await db
      .select({ id: exchangeRates.id })
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.month, toMonth),
          eq(exchangeRates.fromCurrency, from),
          eq(exchangeRates.toCurrency, to)
        )
      );
    if (existing.length > 0) continue;
    await db.insert(exchangeRates).values({ month: toMonth, fromCurrency: from, toCurrency: to, rate });
    created++;
  }

  revalidatePath("/configuracion");
  revalidatePath("/presupuesto");
  revalidatePath("/");
  return created;
}

/**
 * Fills in the official TRM average for the (month, currency) pairs given.
 *
 * Takes pairs rather than months on purpose. A "fetch every month for every
 * currency" version would be 4 requests per month for pairs that mostly do not
 * exist — with 15 months of USD income and no GBP anywhere, that is 60
 * sequential requests from a Raspberry Pi instead of 15.
 *
 * Only touches pairs with no rate yet: a manual entry is a deliberate choice
 * and is never overwritten by a fetch.
 *
 * Network failures are counted per pair, not thrown: a Pi with no internet
 * degrades to "nothing was fetched" and leaves the existing rates alone.
 */
export async function refreshRatesFromTrm(
  pairs: { month: string; currency: string }[]
) {
  const [s] = await db.select().from(settings).where(eq(settings.id, "default"));
  const base = s?.baseCurrency ?? "COP";
  if (base !== "COP") {
    throw new Error(
      "La TRM solo convierte a pesos. Si tu moneda base es otra, registra las tasas a mano."
    );
  }

  const existing = await db
    .select({ month: exchangeRates.month, from: exchangeRates.fromCurrency })
    .from(exchangeRates)
    .where(eq(exchangeRates.toCurrency, "COP"));
  const have = new Set(existing.map((r) => `${r.month}|${r.from}`));

  // Only pairs that exist in the data AND still need a rate. A TRM is only
  // published for the currencies in the list, so anything else is manual-only.
  const wanted = pairs.filter(
    (pair) =>
      (TRM_CURRENCIES as readonly string[]).includes(pair.currency) &&
      !have.has(`${pair.month}|${pair.currency}`)
  );

  const results = await Promise.all(
    wanted.map(async (pair) => {
      const average = await fetchMonthlyAverageTrm(pair.month);
      if (average === null) return { pair, saved: false };
      await db
        .insert(exchangeRates)
        .values({
          month: pair.month,
          fromCurrency: pair.currency,
          toCurrency: "COP",
          rate: average,
          note: "TRM promedio (automático)",
        })
        .onConflictDoUpdate({
          target: [exchangeRates.month, exchangeRates.fromCurrency, exchangeRates.toCurrency],
          set: { rate: average, note: "TRM promedio (automático)" },
        });
      return { pair, saved: true };
    })
  );

  revalidatePath("/configuracion");
  revalidatePath("/presupuesto");
  revalidatePath("/");
  return {
    saved: results.filter((r) => r.saved).length,
    noData: results.filter((r) => !r.saved).map((r) => r.pair),
    alreadyThere: pairs.length - wanted.length,
  };
}

/** Turns the conversion of multi-currency amounts on or off. */
export async function setConvertCurrency(enabled: boolean) {
  await saveSettings({ convertCurrency: enabled });
  revalidatePath("/configuracion");
  revalidatePath("/presupuesto");
  revalidatePath("/");
}

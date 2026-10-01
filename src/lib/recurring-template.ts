/**
 * "Registrar el de este mes" — ROADMAP §2.2.
 *
 * `/recurrentes` detectaba, avisaba de subidas y proyectaba los próximos 30
 * días, pero no había forma de **hacer** nada con nada de eso: era un informe.
 * Esto es el paso que lo convierte en herramienta.
 *
 * ## Por qué bajo demanda y no "los próximos 3 meses"
 *
 * El ROADMAP pedía generar los movimientos de los tres meses siguientes. No es
 * posible sin una decisión mucho más grande, y no por falta de esfuerzo:
 *
 * `currentBalances` suma **todo** movimiento posterior a la fecha de referencia,
 * sin mirar si la fecha es pasada o futura. Un movimiento fechado en noviembre
 * fechado en diciembre **restaría saldo hoy**, por plata que todavía no se movió
 * de ninguna cuenta. Lo mismo con el presupuesto: los sobres de noviembre
 * empezarían gastados.
 *
 * Arreglarlo exige un concepto de "movimiento planificado" y que **todos** los
 * agregados lo excluyan — `currentBalances`, `movementByAccount`,
 * `totalsByMonth`, `spendByCategoryByMonth`, `movementByAccountAndMonth`, la
 * proyección. Seis sitios en los que olvidar la condición es un saldo o un
 * presupuesto equivocado, que es la clase de bug que esta app ya ha tenido tres
 * veces. No se paga ese precio por una función de planificación.
 *
 * Lo que sí es útil, y es el flujo real: es el día 5, viste que Netflix ya cobró
 * y no lo has registrado. Un clic lo crea, con la fecha, el monto, la categoría y
 * la cuenta que ya se sabían, y la fecha correcta del mes.
 *
 * Puro, como el resto: la decisión de qué crear y cuándo no se puede probar en
 * un componente.
 */

import { monthKey } from "@/lib/month";
import { safeDayOfMonth } from "@/lib/recurring";
import { isStillCharging, monthsSinceLastCharge } from "@/lib/recurring-projection";

export type RecurringTemplate = {
  /** La clave del grupo de detección: la misma que usa el descarte. */
  key: string;
  label: string;
  currency: string;
  accountId: string | null;
  categoryId: string | null;
  payeeId: string | null;
  latestAmountMinor: number;
  lastDate: Date;
  medianIntervalDays: number | null;
  dayOfMonth: number | null;
};

export type PlannedCharge = {
  date: Date;
  amountMinor: number;
  currency: string;
  accountId: string | null;
  categoryId: string | null;
  payeeId: string | null;
  description: string;
  /**
   * Por qué la fecha quedó donde quedó. La UI lo dice, porque una fecha
   * distinta a la esperada sin explicación se lee como un error.
   */
  dateNote: "expected-day" | "clamped-to-month-end";
};

export type PlanResult =
  | { kind: "ready"; charge: PlannedCharge; monthsAgo: number }
  | { kind: "not-charging"; monthsAgo: number }
  | { kind: "not-due-yet"; dueDate: Date }
  | { kind: "already-recorded" }
  | { kind: "needs-account" }
  | { kind: "no-day" };

/**
 * Qué movimiento habría que crear hoy para este recurrente, si alguno.
 *
 * Las condiciones para devolver `ready` son todas necesarias y ninguna es
 * negociable:
 *
 * - **Que siga cobrando.** Un servicio cancelado hace meses no tiene nada que
 *   registrar, y ofrecer el botón sería ofrecer trabajo inventado.
 * - **Que ya le haya tocado.** Un cargo que toca el día 30 y hoy es 12 todavía no
 *   pasó. Este botón no crea movimientos futuros —justo el problema que este
 *   archivo no quiere tener—: lo que no ha ocurrido se ve en la tarjeta de
 *   gastos previstos, con su fecha. Y cuando ya tocó, la fecha que se propone es
 *   el día en que le corresponde haber cobrado, no hoy, porque el banco cobró
 *   ese día y no el día en que vaya a mirar uno.
 * - **Que tenga cuenta.** Es la única cosa que la app no puede deducir del
 *   histórico, y crearlo en otra cuenta sería peor que no crearlo.
 * - **Que tenga un día del mes.** Sin día no hay fecha que proponer, y una fecha
 *   inventada es trabajo para el usuario.
 * - **Que no esté ya registrado.** Se comprueba contra la firma del movimiento
 *   propuesto, a nivel de mes. Es el mismo riesgo —el doble clic— y la misma
 *   respuesta: no crear dos veces. A nivel de mes y no de día a propósito: si el
 *   banco lo cobró el 3 y el usuario lo registró el 5, sigue siendo el mismo
 *   cargo y ofrecer el botón sería una trampa.
 */
export function planChargeForMonth(
  template: RecurringTemplate,
  today: Date,
  /** Firmas de lo ya registrado este mes: `${mes}|${monto}|${comercio}`. */
  recordedSignatures: Set<string>
): PlanResult {
  const monthsAgo = monthsSinceLastCharge(template.lastDate, today);
  if (!isStillCharging(template.lastDate, today, template.medianIntervalDays)) {
    return { kind: "not-charging", monthsAgo };
  }
  if (!template.accountId) return { kind: "needs-account" };
  if (template.dayOfMonth === null) return { kind: "no-day" };

  const year = today.getFullYear();
  const monthIndex = today.getMonth();
  // El 31 de un mes de 30 días es el 30, y en febrero el 28 o el 29. Ajustar el
  // día es lo único razonable: desplazar el cargo a marzo lo metería en otro
  // mes y contaminaría el presupuesto de ese mes.
  const day = safeDayOfMonth(year, monthIndex, template.dayOfMonth);
  const dueDate = new Date(year, monthIndex, day);
  if (day > today.getDate()) return { kind: "not-due-yet", dueDate };

  if (recordedSignatures.has(recordedSignature(dueDate, template.latestAmountMinor, template.key))) {
    return { kind: "already-recorded" };
  }

  return {
    kind: "ready",
    monthsAgo,
    charge: {
      date: dueDate,
      amountMinor: template.latestAmountMinor,
      currency: template.currency,
      accountId: template.accountId,
      categoryId: template.categoryId,
      payeeId: template.payeeId,
      description: template.label,
      dateNote: day === template.dayOfMonth ? "expected-day" : "clamped-to-month-end",
    },
  };
}

/**
 * La firma de un movimiento ya registrado, en la forma que `planChargeForMonth`
 * compara.
 *
 * `groupKey` es la clave del grupo de detección, no el nombre del comercio. Por
 * dos razones: con el payee puesto, dos cargos de Netflix el mismo día son dos
 * cargos y solo uno debe quedar registrado como "el de la suscripción"; y
 * anclar a la clave evita que la comparación se rompa en silencio si la etiqueta
 * se vuelve a limpiar, que es exactamente lo que pasó con la primera versión de
 * esto.
 *
 * El mes va dentro y no el día a propósito: si el banco cobró el 3 y el usuario
 * lo registró el 5, sigue siendo el mismo cargo, y comparar por día ofrecería el
 * botón sobre un cargo ya capturado.
 */
export function recordedSignature(
  date: Date,
  amountMinor: number,
  groupKey: string,
  month = monthKey(date)
) {
  return `${month}|${Math.abs(amountMinor)}|${groupKey}`;
}

/**
 * Convierte un grupo detectado en una plantilla.
 *
 * El payee sale de la clave y no del grupo, porque `RecurringGroup` no lo guarda
 * por separado: la clave *es* su identidad, y volver a derivarlo en la página
 * sería una cuarta forma de preguntar lo mismo.
 */
export function toRecurringTemplate(
  group: {
    key: string;
    label: string;
    currency: string;
    accountId: string | null;
    categoryId: string | null;
    lastDate: Date;
    medianIntervalDays: number | null;
    dayOfMonth: number | null;
    latestAmountMinor: number;
  },
  payeeIdFromKey: (key: string) => string | null
): RecurringTemplate {
  return {
    key: group.key,
    label: group.label,
    currency: group.currency,
    accountId: group.accountId,
    categoryId: group.categoryId,
    payeeId: payeeIdFromKey(group.key),
    latestAmountMinor: group.latestAmountMinor,
    lastDate: group.lastDate,
    medianIntervalDays: group.medianIntervalDays,
    dayOfMonth: group.dayOfMonth,
  };
}

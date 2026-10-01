/**
 * "Gastos previstos ≈ $340.000" — ROADMAP §1.5.
 *
 * `/recurrentes` es un informe retroactivo: describe lo que ya pasó. Esto
 * contesta la otra pregunta, la que uno se hace al abrir la app a beginnings de
 * mes: *¿cuánto va a salir?*. Con los mismos datos de siempre, sin planning
 * nuevo — solo la lista de cargos que ya se sabe que se repiten.
 *
 * Puro, como el resto de la lógica de `recurring.ts`. Lo que hay que acertar no
 * es la suma, es **a quién contar**: una suscripción cancelada hace ocho meses
 * sigue siendo un gasto recurrente y no es un gasto futuro.
 */

/** Días hacia adelante que cubre la proyección: un mes, que es como se piensa el gasto. */
export const DEFAULT_HORIZON_DAYS = 30;

/**
 * Cuánto puede pasar sin que un recurrente deje de contar como activo.
 *
 * Un cargo mensual cada ~30 días; 45 toleraría un cobro fallido o un mes sin
 * registrar sin dar de baja la suscripción, y descarta lo que lleva más de un
 * ciclo y medio sin aparecer — que para una suscripción mensual significa
 * cancelada. Con 30 el error de un día de desfase ya la apagaría.
 */
export const ACTIVE_WINDOW_DAYS = 45;

/**
 * Cuántos meses lleva sin aparecer un recurrente que la ventana ya dio por
 * muerto.
 *
 * Meses y no días, porque es la pregunta que el usuario se hace al ver un
 * servicio que no usa: "¿hace cuánto que lo cancelé?". Y en meses, no en días,
 * porque "45 días" no quiere decir nada para alguien que lee una lista de
 * suscripciones.
 */
/**
 * En qué mes natural cae el último cargo, contado hacia atrás desde hoy.
 *
 * La diferencia de mes calendario, sin ajuste por día del mes. Un cargo del 25 de
 * julio visto el 20 de agosto es "hace un mes" —porque su mes fue julio— y no
 * "hace cero meses", que es lo que daría un ajuste por día. Y un cargo de este
 * mes da 0, que es lo que el usuario quiere ver en una lista de suscripciones.
 */
export function monthsSinceLastCharge(lastDate: Date, today: Date): number {
  const months =
    (today.getFullYear() - lastDate.getFullYear()) * 12 + (today.getMonth() - lastDate.getMonth());
  // Sin `max(0, …)` un cargo fechado en un mes futuro daría negativo, y
  // "hace -1 meses" no es un número que se pueda mostrar.
  return Math.max(0, months);
}

/**
 * Si un recurrente sigue vivo, a la vista.
 *
 * La misma ventana que usa la proyección, por una razón que no es la
 * DRY-ness: si la tarjeta de abajo dice "Netflix vuelve en 20 días" y la fila de
 * arriba dice "Netflix está cancelado", la página se contradice. Una sola
 * definición de qué está vivo.
 */
/**
 * Margen sobre el intervalo antes de declarar un recurrente cancelado.
 *
 * Un ciclo entero, no medio. La cuenta es: un cargo mensual del día 5 revisado
 * el día 20 del mes siguiente está a 46 días del anterior, y esa suscripción
 * está perfectamente viva — lo que pasa es que el cargo del 5 aún no se ha
 * registrado. Con medio ciclo de margen (45 días) el botón para registrarlo
 * desaparecía justo cuando hacía falta, que es el error más tonto posible en una
 * feature cuyo propósito es ayudar con la tarea del mes.
 *
 * Con un ciclo entero, "no aparece desde hace dos meses" es la primera vez que se
 * declara cancelada, que es cuando empieza a ser verdad.
 */
export const STALE_INTERVAL_MULTIPLIER = 2;

/**
 * Si un recurrente sigue cobrando.
 *
 * **Relativo a su propio intervalo, no a un número fijo de días.** Un cargo
 * semanal y uno mensual necesitan tolerancias distintas, y un umbral fijo tiene
 * que ser o demasiado corto para el mensual o demasiado largo para el semanal —
 * que es como un solo número acaba sirviendo para dos preguntas que no son la
 * misma.
 *
 * La proyección usa un criterio más estrecho y lo dice: allí la pregunta es
 * "¿vuelve a cobrar pronto?", y un cargo con más de un mes y medio de silencio
 * no se proyecta aunque la suscripción siga viva. Ver `isStillCharging` contra
 * `willBillSoon`.
 */
export function isStillCharging(
  lastDate: Date,
  today: Date,
  medianIntervalDays: number | null
): boolean {
  const daysSince = (today.getTime() - lastDate.getTime()) / 86_400_000;
  // Sin intervalo no hay ciclo con el cual ser tolerante, así que se cae al
  // umbral fijo. Un grupo sin intervalo son menos de tres cargos, que es un caso
  // que la detección casi no produce.
  const window = medianIntervalDays
    ? medianIntervalDays * STALE_INTERVAL_MULTIPLIER
    : ACTIVE_WINDOW_DAYS;
  return daysSince <= window;
}

/**
 * Si conviene predecir su próximo cargo en la tarjeta de gastos previstos.
 *
 * Distinto de "sigue cobrando" a propósito. Predecir es afirmar que va a pasar,
 * y para eso hace falta más evidencia que para no tacharlo de la lista: un cargo
 * que se espera para dentro de dos semanas a partir de un último cobro de hace
 * seis semanas no es una predicción, es un deseo.
 */
export function willBillSoon(
  lastDate: Date,
  today: Date,
  medianIntervalDays: number | null
): boolean {
  if (!isStillCharging(lastDate, today, medianIntervalDays)) return false;
  if (!medianIntervalDays) return true;
  // El umbral del intervalo, no un múltiplo: la predicción es sobre el siguiente
  // cobro, y ese ocurre un ciclo después del último, no dos.
  return (today.getTime() - lastDate.getTime()) / 86_400_000 <= medianIntervalDays;
}

export type UpcomingCharge = {
  key: string;
  label: string;
  /** When the next charge is expected, from the last one plus its own interval. */
  expectedDate: Date;
  daysAway: number;
  amountMinor: number;
};

export type Projection = {
  currency: string;
  totalMinor: number;
  charges: UpcomingCharge[];
};

/**
 * Qué se espera gastar en los próximos días, por moneda.
 *
 * El monto proyectado es el **último cargo**, no el promedio del grupo: el
 * promedio de una suscripción que subió de 35.000 a 42.000 da "unos 39.000", y
 * 39.000 no es lo que van a cobrar. Para lo que ya ocurrió el promedio sirve; para
 * lo que viene, no.
 *
 * La fecha esperada sale de `lastDate + medianIntervalDays`, no de "dentro de 30
 * días, cobra". Eso conserva la fase: una suscripción que cobra el día 5 y otra
 * que cobra el día 28 no se pueden tratar igual solo porque ambas caen dentro
 * del mes. El intervalo lo mide el detector sobre los cargos reales, así que un
 * cargo cada 20 días se proyecta en su día, no en el día 30.
 *
 * Por moneda, siempre: sumar dólares a pesos sin tasa produce un total que no
 * corresponde a nada (ROADMAP §0.7b).
 */
export function projectUpcoming(
  groups: {
    key: string;
    label: string;
    currency: string;
    lastDate: Date;
    medianIntervalDays: number | null;
    latestAmountMinor: number;
  }[],
  today: Date,
  horizonDays = DEFAULT_HORIZON_DAYS
): Projection[] {
  const horizonEnd = new Date(today);
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

  const byCurrency = new Map<string, UpcomingCharge[]>();

  for (const group of groups) {
    // Sin intervalo no hay fecha que proyectar: un grupo con dos cargos tiene
    // una diferencia, pero un solo mes de historia no es una suscripción, es un
    // movimiento que se parece a otro.
    if (group.medianIntervalDays === null) continue;

    // Un recurrente que no vuelve a cobrar pronto no se proyecta. Es el caso que hace que un informe
    // retrospectivo y una previsión discrepan, y discrepan a propósito: la lista
    // de "recurrentes" incluye lo que se canceló, el dinero que va a salir este
    // mes no.
    if (!willBillSoon(group.lastDate, today, group.medianIntervalDays)) continue;

    const expectedDate = new Date(group.lastDate);
    expectedDate.setDate(expectedDate.getDate() + group.medianIntervalDays);
    if (expectedDate > horizonEnd) continue;
    // Un cargo con la fecha esperada ya vencida no es "próximo": está atrasado.
    // Listarlo aquí daría un "hace 15 días" dentro de una tarjeta que promete los
    // próximos 30, y además escondería que lo que corresponde es registrarlo —que
    // es lo que hace el botón de la tabla de abajo.
    if (expectedDate < today) continue;

    const charge: UpcomingCharge = {
      key: group.key,
      label: group.label,
      expectedDate,
      daysAway: Math.round(
        (expectedDate.getTime() - today.getTime()) / 86_400_000
      ),
      amountMinor: group.latestAmountMinor,
    };

    const list = byCurrency.get(group.currency) ?? [];
    list.push(charge);
    byCurrency.set(group.currency, list);
  }

  return [...byCurrency.entries()]
    .map(([currency, charges]) => ({
      currency,
      // Lo primero que va a salir es lo que más pesa en la cuenta.
      totalMinor: charges.reduce((sum, c) => sum + c.amountMinor, 0),
      charges: charges.sort((a, b) => a.daysAway - b.daysAway),
    }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

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

    // Un grupo que no aparece hace más de un ciclo y medio no se proyecta. Es el
    // caso que hace que un informe retrospectivo y una previsión discrepan, y
    // discrepar a propósito: la lista de "recurrentes" incluye lo que se canceló,
    // el dinero que va a salir este mes no.
    if (today.getTime() - group.lastDate.getTime() > ACTIVE_WINDOW_DAYS * 86_400_000) continue;

    const expectedDate = new Date(group.lastDate);
    expectedDate.setDate(expectedDate.getDate() + group.medianIntervalDays);
    if (expectedDate > horizonEnd) continue;

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

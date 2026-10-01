import { monthKey } from "@/lib/month";

/**
 * Lo que la app no puede ver de sí misma.
 *
 * Los saldos de esta app son siempre **derivados**: `referenceBalanceMinor` de la
 * cuenta más los movimientos posteriores a su fecha de referencia. Eso es rápido
 * y no necesita snapshots, pero tiene una consecuencia incómoda: si los datos
 * son inconsistentes, el número que muestra no está equivocado de forma visible,
 * está equivocado y nada lo delata.
 *
 * Estas son las dos formas en que eso pasa, y las dos producían números que
 * mienten sin un solo error visible:
 *
 * 1. **Movimientos anteriores a la fecha de referencia de su cuenta.** El saldo
 *    los ignora — para eso está la fecha de referencia, el saldo de partida ya
 *    los incluye — pero **todos** los demás totales sí los cuentan. El resultado
 *    es una app que dice "$412.000 gastados en agosto" y un saldo que no refleja
 *    ni uno de esos pesos. Pasa al importar un extracto de un periodo anterior,
 *    o al mover la fecha de referencia de una cuenta a una fecha más reciente.
 *
 * 2. **Splits que suman más que su transacción.** Un desglose atribuiría más
 *    plata de la que salió; el remanente negativo se descarta en silencio y las
 *    categorías, el presupuesto y las estadísticas quedan con más gasto del que
 *    hubo. Ya no se puede crear por la acción (ver `findOversplit`), pero los
 *    datos anteriores al arreglo siguen ahí, y esta es la única forma de
 *    encontrarlos.
 *
 * Puro y sin dependencias: recibe filas y devuelve hallazgos. La consulta es lo
 * más fácil; decidir qué es un error y cómo contarlo es lo que no puede quedar
 * disperso en un componente.
 */

/** Lo mínimo para saber si un movimiento cae antes del punto de partida. */
export type ReferencedMovement = {
  id: number;
  accountId: string;
  date: Date;
  amountMinor: number;
  currency: string;
  description: string | null;
};

export type ReferenceAccount = {
  id: string;
  name: string;
  referenceDate: Date;
};

export type BeforeReferenceFinding = {
  accountId: string;
  accountName: string;
  referenceDate: Date;
  count: number;
  /** Suma por moneda, porque las cuentas no mezclan monedas en un mismo total. */
  totalsByCurrency: Record<string, number>;
  /** Las pocas filas que hay que poder abrir para arreglarlo. */
  sampleIds: number[];
};

export type OversplitFinding = {
  transactionId: number;
  currency: string;
  /** 'YYYY-MM' del movimiento, para poder llevar el aviso a la lista correcta. */
  month: string;
  splitTotal: number;
  parentAmount: number;
  excessMinor: number;
  description: string | null;
};

/** Cuántas filas enumerar antes de resumir el resto. */
export const MAX_SAMPLE = 5;

/**
 * Movimientos que el saldo de su cuenta no cuenta.
 *
 * `date <= referenceDate`, no `<`: la comparación del saldo en `currentBalances` y
 * en `movementByAccount` es estrictamente mayor, así que un movimiento del
 * **mismo día** que la fecha de referencia tampoco suma. Es el mismo detalle que
 * el filtro de mes del CSV, y por la misma razón importa.
 */
export function findMovementsBeforeReference(
  accountsList: ReferenceAccount[],
  movements: ReferencedMovement[]
): BeforeReferenceFinding[] {
  const byId = new Map(accountsList.map((a) => [a.id, a]));

  const grouped = new Map<string, BeforeReferenceFinding & { ids: number[] }>();
  for (const movement of movements) {
    const account = byId.get(movement.accountId);
    if (!account) continue;
    if (movement.date > account.referenceDate) continue;

    let finding = grouped.get(movement.accountId);
    if (!finding) {
      finding = {
        accountId: account.id,
        accountName: account.name,
        referenceDate: account.referenceDate,
        count: 0,
        totalsByCurrency: {},
        sampleIds: [],
        ids: [],
      };
      grouped.set(movement.accountId, finding);
    }
    finding.count += 1;
    finding.ids.push(movement.id);
    finding.totalsByCurrency[movement.currency] =
      (finding.totalsByCurrency[movement.currency] ?? 0) + Math.abs(movement.amountMinor);
  }

  return [...grouped.values()]
    .map(({ ids, ...finding }) => ({ ...finding, sampleIds: ids.slice(0, MAX_SAMPLE) }))
    // La cuenta con más movimientos afectados primero: es la que más está
    // descuadrada y la más urgente de arreglar.
    .sort((a, b) => b.count - a.count);
}

/**
 * Desgloses que atribuyen más plata que la transacción.
 *
 * `amountMinor` negativo no se considera: una transferencia se guarda con signo
 * negativo y no lleva splits, así que un caso imposible no debe aparecer en la
 * lista de errores. La comparación es en valor absoluto por si acaso.
 */
export function findOversplitTransactions(
  rows: {
    transactionId: number;
    currency: string;
    date: Date;
    description: string | null;
    parentAmount: number;
    splits: { amountMinor: number }[];
  }[]
): OversplitFinding[] {
  const findings: OversplitFinding[] = [];
  for (const row of rows) {
    const splitTotal = row.splits.reduce((s, split) => s + split.amountMinor, 0);
    const excessMinor = splitTotal - Math.abs(row.parentAmount);
    if (excessMinor > 0) {
      findings.push({
        transactionId: row.transactionId,
        currency: row.currency,
        // `monthKey`, no un strftime propio: la tarjeta lleva el aviso a
        // /transacciones?month=..., y ese filtro cuenta los meses con
        // `transactionMonth`. Dos definiciones de mes yaproductive disagreement
        // una vez (ROADMAP §3.1).
        month: monthKey(row.date),
        description: row.description,
        splitTotal,
        parentAmount: row.parentAmount,
        excessMinor,
      });
    }
  }
  return findings.sort((a, b) => b.excessMinor - a.excessMinor);
}

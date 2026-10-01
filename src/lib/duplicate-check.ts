/**
 * "¿No estás agregando esto dos veces?" — ROADMAP §2.5.
 *
 * El importador ya sabe detectar duplicados por firma `fecha|monto|descripción`,
 * pero la captura manual no tenía nada. Un doble clic en "guardar", o pegar el
 * mismo comprobante dos veces, produce dos movimientos iguales y el saldo queda
 * mal sin que nada lo advierta: no es un error visible, es un número que no
 * cuadra.
 *
 * Puro, como el resto. Lo que hay que acertar no es la consulta —eso es un
 * `WHERE` sobre una fecha— sino **qué cuenta como duplicado** en entrada manual,
 * que es un problema distinto al del importador.
 */

/** Solo lo que hace falta para comparar. La consulta lo trae de una vez. */
export type DuplicateCandidate = {
  id: number;
  date: Date;
  amountMinor: number;
  currency: string;
  payeeId: string | null;
  description: string | null;
};

export type DuplicateDraft = {
  /** Excluye la fila que se está editando: comparar consigo misma siempre coincide. */
  id?: number;
  date: Date;
  amountMinor: number;
  currency: string;
  payeeId: string | null;
  description: string | null;
};

export type DuplicateMatch = {
  id: number;
  /**
   * `exact` — mismo comercio, mismo monto, mismo día. Casi con seguridad la
   * misma compra escrita dos veces.
   *
   * `likely` — mismo monto el mismo día, pero sin comercio que confirmar. Puede
   * ser un duplicado o pueden ser dos compras iguales de verdad: dos cafés, dos
   * pulseras idénticas en una feria. Por eso es un aviso y no un bloqueo.
   */
  confidence: "exact" | "likely";
};

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function normalize(text: string | null) {
  return (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Los movimientos que probablemente sean el mismo que el que se está escribiendo.
 *
 * Dos decisiones que el importador no tuvo que tomar:
 *
 * **La fecha es local, no UTC.** `toISOString().slice(0, 10)` de un movimiento
 * escrito a las 8 de la tarde en Colombia da el día siguiente, y compararía un
 * movimiento de hoy contra los de mañana. Es el mismo error de §3.1, en un sitio
 * donde nadie lo ha medido todavía.
 *
 * **La firma no incluye la descripción, como sí la del importador.** En un PDF
 * la descripción es la que dice el banco; escrita a mano es texto libre, y dos
 * copias del mismo movimiento rara vez coinciden palabra por palabra. Por eso el
 * comercio decide la confianza en vez de la identidad. Y cuando no hay comercio,
 * la comparación exacta cae a la descripción normalizada, que es lo único que
 * queda.
 *
 * **El monto se compara en valor absoluto.** Una transferencia tiene signo
 * negativo en la base y un gasto escrito a mano, positivo: el mismo movimiento
 * en las dos mitades de la app no debe aparecer como duplicado de sí mismo.
 */
export function findDuplicates(
  draft: DuplicateDraft,
  existing: DuplicateCandidate[]
): DuplicateMatch[] {
  const draftText = normalize(draft.description);

  return existing
    .filter((row) => {
      if (draft.id !== undefined && row.id === draft.id) return false;
      if (row.currency !== draft.currency) return false;
      if (Math.abs(row.amountMinor) !== Math.abs(draft.amountMinor)) return false;
      return sameLocalDay(row.date, draft.date);
    })
    .map((row) => {
      const samePayee =
        draft.payeeId !== null && row.payeeId !== null && draft.payeeId === row.payeeId;
      const sameText = draftText !== "" && normalize(row.description) === draftText;
      return { id: row.id, confidence: samePayee || sameText ? ("exact" as const) : ("likely" as const) };
    })
    // Las coincidencias exactas primero: son las que el usuario tiene delante
    // cuando decide si guardar o no.
    .sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "exact" ? -1 : 1));
}

/** Cuántas filas enumerar en el aviso antes de resumir el resto. */
export const MAX_REPORTED_DUPLICATES = 3;

export type DuplicateWarning = {
  matches: DuplicateMatch[];
  /** Filas que existen pero no se enumeran. */
  extraCount: number;
  hasExact: boolean;
};

/**
 * El aviso, resumido.
 *
 * La lista se corta porque el caso frecuente es un doble clic, no veinte: dos
 * filas ya dicen "esto ya está" y una lista larga se lee como un bug.
 */
export function summarizeDuplicates(matches: DuplicateMatch[]): DuplicateWarning | null {
  if (matches.length === 0) return null;
  return {
    matches: matches.slice(0, MAX_REPORTED_DUPLICATES),
    extraCount: Math.max(0, matches.length - MAX_REPORTED_DUPLICATES),
    hasExact: matches.some((m) => m.confidence === "exact"),
  };
}

/**
 * Una fila resumida, con lo justo para que el aviso sea clicable.
 *
 * El enlace al movimiento es la mitad del valor de la advertencia: poder abrir
 * la fila y ver que es la misma compra convierte "creo que esto ya está" en
 * "ahí está, era esta". Sin eso el aviso obliga a ir a buscarla a mano.
 */
export type DuplicateReport = DuplicateWarning & {
  rows: {
    id: number;
    dateLabel: string;
    description: string | null;
    payeeName: string | null;
    confidence: DuplicateMatch["confidence"];
  }[];
};

/** Une la comparación con los nombres que el aviso necesita para leerse. */
export function buildDuplicateReport(
  matches: DuplicateMatch[],
  rows: Map<number, { dateLabel: string; description: string | null; payeeName: string | null }>
): DuplicateReport | null {
  const summary = summarizeDuplicates(matches);
  if (!summary) return null;
  return {
    ...summary,
    rows: summary.matches.map((match) => ({
      id: match.id,
      confidence: match.confidence,
      dateLabel: rows.get(match.id)?.dateLabel ?? "",
      description: rows.get(match.id)?.description ?? null,
      payeeName: rows.get(match.id)?.payeeName ?? null,
    })),
  };
}

/**
 * Shared empty state.
 *
 * Every table used to say "No hay X que coincidan", which is a sentence about
 * a *filter* — so a brand-new database read as though a search had failed. The
 * two cases are genuinely different and only one of them is the user's fault,
 * so the component takes both and picks the right message.
 */
export function EmptyState({
  noun,
  isFiltered,
  action,
}: {
  /** Plural noun, e.g. "transacciones". */
  noun: string;
  /** True when a search or filter is active. */
  isFiltered: boolean;
  /** Optional next step, e.g. a link to the importer. */
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium">
        {isFiltered ? `Ninguna coincidencia` : `Aún no hay ${noun}`}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {isFiltered
          ? `Ningún ${noun.replace(/s$/, "")} coincide con los filtros actuales. Prueba a limpiarlos.`
          : `Cuando agregues ${noun}, aparecerán aquí.`}
      </p>
      {action}
    </div>
  );
}

/**
 * Month-specific empty state for the budget page, which showed a bare "$ 0".
 * A zero is correct but explains nothing: it looks identical whether the user
 * budgeted nothing, recorded nothing, or is looking at the wrong month.
 */
export function MonthEmptyState({ month, hasAnyBudgets }: { month: string; hasAnyBudgets: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-medium">No hay presupuesto para {month}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {hasAnyBudgets
          ? "Hay presupuestos en otros meses. Puedes copiar los amounts de un mes a este con el botón de abajo."
          : "Asigna un monto a cada categoría para empezar a controlar el mes."}
      </p>
    </div>
  );
}

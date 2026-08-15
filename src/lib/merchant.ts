const PREFIX_STRIPS: [RegExp, string][] = [
  [/^COMPRA\s+(EN|INTL)\s+/i, ""],
  [/^PAGO\s+(PSE|INTERBANC)\s+/i, ""],
  [/^(COBRO|ABONO|AJUSTE)\s+/i, ""],
  [/^RETIRO\s+CAJERO\s+(ATM\s+)?/i, "Retiro Cajero "],
  [/^TRANSFERENCIAS?\s+A\s+/i, "Transferencia a "],
];

/**
 * Collapses a raw bank statement description ("COMPRA EN RAPPI COLO") into a
 * stable, human-readable merchant label ("Rappi Colo") so repeated charges
 * from the same merchant group together instead of needing to be reviewed
 * one by one.
 */
export function cleanMerchantName(raw: string): string {
  let s = raw.trim();
  for (const [re, replacement] of PREFIX_STRIPS) {
    s = s.replace(re, replacement);
  }
  // Strip trailing account/reference codes, e.g. "SUSCR CTA 8935 04 26"
  s = s.replace(/\bCTA\s+\d+(\s+\d+)*\s*$/i, "").trim();
  s = s.replace(/\s{2,}/g, " ").trim();
  s = s.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  return s || raw.trim();
}

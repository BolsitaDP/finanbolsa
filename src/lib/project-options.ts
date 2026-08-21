/**
 * Combobox items for a "Proyecto / Viaje" picker: "none" plus every active
 * project name. `currentValue` is included even when it's no longer in
 * `projectNames` (an archived project, or a stray value from before this
 * field had a managed list) — otherwise picking it up in an existing
 * transaction would make the combobox show "Ninguno" and silently look
 * cleared instead of just displaying a name outside the current list.
 */
export function projectTripItems(
  projectNames: string[],
  currentValue?: string | null
): Record<string, string> {
  const items: Record<string, string> = { none: "Ninguno" };
  for (const name of projectNames) items[name] = name;
  if (currentValue && currentValue !== "none" && !(currentValue in items)) {
    items[currentValue] = currentValue;
  }
  return items;
}

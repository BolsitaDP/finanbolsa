"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { ChevronsUpDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

type Option = { value: string; label: string };

/**
 * Generic searchable dropdown — a drop-in replacement for `Select` wherever
 * the option list can grow long enough that scanning it beats filtering it.
 * `items` keeps the same `Record<id, label>` shape `Select` already uses
 * everywhere, so callers don't need to restructure their data.
 *
 * Internally, base-ui's Combobox treats the *whole option object* as its
 * value type when items are objects (not just the `id` string) — that's
 * what makes its default label-based filtering work without extra
 * plumbing. `isItemEqualToValue` bridges that back to this component's
 * plain string `value`/`onValueChange` contract.
 */
export function Combobox({
  items,
  value,
  onValueChange,
  placeholder = "Selecciona...",
  searchPlaceholder = "Buscar...",
  emptyLabel = "Sin resultados",
  disabled,
  className,
}: {
  items: Record<string, string>;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const options = React.useMemo<Option[]>(
    () => Object.entries(items).map(([value, label]) => ({ value, label })),
    [items]
  );
  const selected = React.useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  return (
    <ComboboxPrimitive.Root
      items={options}
      value={selected}
      onValueChange={(next) => onValueChange(next ? (next as Option).value : "")}
      isItemEqualToValue={(a, b) => (a as Option).value === (b as Option).value}
      disabled={disabled}
    >
      <ComboboxPrimitive.Trigger
        className={cn(
          "flex h-8 w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
          className
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
      </ComboboxPrimitive.Trigger>
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner className="isolate z-50 outline-none" sideOffset={4}>
          <ComboboxPrimitive.Popup className="z-50 max-h-(--available-height) w-(--anchor-width) min-w-48 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            <div className="px-1 pt-1 pb-0">
              <ComboboxPrimitive.Input
                placeholder={searchPlaceholder}
                className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <Separator />
            {/* base-ui keeps this element mounted at all times (for a11y announcements)
                and only fills its children when the list is actually empty — so the
                padding has to live on an inner child, not here, or it'd show as blank
                space even while results are visible. */}
            <ComboboxPrimitive.Empty>
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">{emptyLabel}</div>
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List className="max-h-64 overflow-y-auto p-1">
              {(item: Option) => (
                <ComboboxPrimitive.Item
                  key={item.value}
                  value={item}
                  className="relative flex w-full cursor-default items-center rounded-md px-2 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {item.label}
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}

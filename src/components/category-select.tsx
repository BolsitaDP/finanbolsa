"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string; kind: string; parentCategoryId: string | null };

/**
 * Category picker with a search box and a hover-opened submenu per parent
 * category (parent categories with children act as both a submenu trigger
 * — hover to see subcategories — and their own selectable entry, listed
 * first inside their own submenu). Swaps to a flat, parent-annotated list
 * while searching, since drilling into a hover submenu doesn't make sense
 * once the list is already filtered down.
 */
export function CategorySelect({
  categories,
  value,
  onValueChange,
  kind,
  includeNone = true,
  noneLabel = "Sin categoría",
  placeholder,
  className,
  disabled,
}: {
  categories: Category[];
  value: string;
  onValueChange: (value: string) => void;
  kind?: "expense" | "income";
  includeNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  const categoryName = React.useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const scoped = React.useMemo(
    () => (kind ? categories.filter((c) => c.kind === kind) : categories),
    [categories, kind]
  );
  const topLevel = React.useMemo(() => scoped.filter((c) => !c.parentCategoryId), [scoped]);
  const childrenByParent = React.useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of scoped) {
      if (!c.parentCategoryId) continue;
      const list = map.get(c.parentCategoryId) ?? [];
      list.push(c);
      map.set(c.parentCategoryId, list);
    }
    return map;
  }, [scoped]);

  const searchResults = React.useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return scoped.filter((c) => c.name.toLowerCase().includes(q));
  }, [scoped, search]);

  const selectedLabel = value === "none" || !value ? (noneLabel ?? placeholder) : (categoryName.get(value) ?? value);

  React.useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setSearch("");
  }

  function pick(id: string) {
    onValueChange(id);
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          "flex h-8 w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
          className
        )}
      >
        <span className={cn("truncate", (value === "none" || !value) && "text-muted-foreground")}>
          {selectedLabel}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 p-0" align="start">
        <div className="p-1">
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Buscar categoría..."
            className="h-7 text-sm"
          />
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto p-1">
          {includeNone && !searchResults && (
            <DropdownMenuItem onClick={() => pick("none")}>{noneLabel}</DropdownMenuItem>
          )}
          {searchResults ? (
            searchResults.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">Sin resultados</div>
            ) : (
              searchResults.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => pick(c.id)}>
                  {c.parentCategoryId && (
                    <span className="text-muted-foreground">
                      {categoryName.get(c.parentCategoryId) ?? ""} ›{" "}
                    </span>
                  )}
                  {c.name}
                </DropdownMenuItem>
              ))
            )
          ) : (
            topLevel.map((c) => {
              const children = childrenByParent.get(c.id) ?? [];
              if (children.length === 0) {
                return (
                  <DropdownMenuItem key={c.id} onClick={() => pick(c.id)}>
                    {c.name}
                  </DropdownMenuItem>
                );
              }
              return (
                <DropdownMenuSub key={c.id}>
                  <DropdownMenuSubTrigger>{c.name}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => pick(c.id)}>{c.name} (general)</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {children.map((child) => (
                      <DropdownMenuItem key={child.id} onClick={() => pick(child.id)}>
                        {child.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

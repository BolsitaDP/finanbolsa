"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, ReceiptTextIcon, TagIcon, UserIcon, WalletIcon } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { globalSearch, type SearchResult } from "@/app/search-actions";

const ICONS: Record<SearchResult["type"], React.ComponentType<{ className?: string }>> = {
  category: TagIcon,
  payee: UserIcon,
  account: WalletIcon,
  transaction: ReceiptTextIcon,
};

// Payees, accounts and transactions don't have their own detail page — the
// closest thing to "jump to it" is landing on the list pre-filtered to just
// that item, via the same `q` search box each table already has.
function resultHref(r: SearchResult): string {
  switch (r.type) {
    case "category":
      return `/categorias/${r.id}`;
    case "payee":
      return `/payees?q=${encodeURIComponent(r.label)}`;
    case "account":
      return `/cuentas?q=${encodeURIComponent(r.label)}`;
    case "transaction":
      return `/transacciones?q=${encodeURIComponent(r.label)}`;
  }
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
  }

  React.useEffect(() => {
    if (query.trim().length < 2) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const r = await globalSearch(query);
        setResults(r);
        setActiveIndex(0);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  function select(r: SearchResult) {
    handleOpenChange(false);
    router.push(resultHref(r));
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[activeIndex];
      if (r) select(r);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <SearchIcon /> Buscar
        <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        >
          <DialogTitle className="sr-only">Búsqueda global</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Buscar transacciones, payees, categorías, cuentas..."
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {query.trim().length < 2 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Escribe al menos 2 caracteres para buscar.
              </p>
            ) : isPending && results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Buscando...</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin resultados.</p>
            ) : (
              results.map((r, i) => {
                const Icon = ICONS[r.type];
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    type="button"
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => select(r)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm",
                      i === activeIndex && "bg-accent text-accent-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{r.label}</span>
                      <span className="truncate text-xs text-muted-foreground">{r.sublabel}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

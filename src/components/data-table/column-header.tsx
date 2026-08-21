"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort()) {
    return (
      <div className={cn("text-xs font-medium tracking-wide text-muted-foreground uppercase", className)}>
        {title}
      </div>
    );
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "-ml-2.5 h-7 gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground",
        className
      )}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {title}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3.5" />
      ) : (
        <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
      )}
    </Button>
  );
}

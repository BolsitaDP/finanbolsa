"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { monthLabel, monthKey, shiftMonth } from "@/lib/month";

export function MonthSwitcher({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Sets `month` while keeping every other query param.
   *
   * It used to `router.push(`${pathname}?month=${m}`)`, which threw away
   * everything else in the URL. That was harmless while only /presupuesto used
   * this, but the same filter is read by the category, payee and project
   * detail pages, so reusing the switcher there would have silently dropped
   * their other filters.
   */
  function go(m: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("month", m);
    router.push(`${pathname}?${next.toString()}`);
  }

  const currentMonth = monthKey(new Date());
  const isCurrentMonth = month === currentMonth;

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon-sm" onClick={() => go(shiftMonth(month, -1))}>
        <ChevronLeftIcon />
      </Button>
      {/* No CSS `capitalize` here: monthLabel already returns the correct
          Spanish "septiembre de 2026", and capitalize would render it as
          "Septiembre De 2026" — uppercasing the connector as well. */}
      <span className="min-w-36 text-center text-sm font-medium">{monthLabel(month)}</span>
      <Button variant="outline" size="icon-sm" onClick={() => go(shiftMonth(month, 1))}>
        <ChevronRightIcon />
      </Button>
      {/* Exploring three months back and having to click the arrow back four
          times to return is a small annoyance repeated often. */}
      {!isCurrentMonth ? (
        <Button variant="ghost" size="sm" onClick={() => go(currentMonth)}>
          Este mes
        </Button>
      ) : null}
    </div>
  );
}

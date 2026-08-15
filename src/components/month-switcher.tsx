"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { monthLabel, shiftMonth } from "@/lib/month";

export function MonthSwitcher({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();

  function go(m: string) {
    router.push(`${pathname}?month=${m}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon-sm" onClick={() => go(shiftMonth(month, -1))}>
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium capitalize">
        {monthLabel(month)}
      </span>
      <Button variant="outline" size="icon-sm" onClick={() => go(shiftMonth(month, 1))}>
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

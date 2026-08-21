"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import { ChartMountGuard } from "@/components/chart-mount-guard";
import { formatMoney } from "@/lib/format";
import type { MonthlyAmount } from "@/lib/spending-stats";

const MONTH_LABELS = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  return `${MONTH_LABELS[Number(m) - 1]} ${year.slice(2)}`;
}

export function MonthlyTrendChart({
  data,
  currency,
  color,
}: {
  data: MonthlyAmount[];
  currency: string;
  color: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeMonth = searchParams.get("month");

  const points = data.map((p) => ({ key: p.month, label: monthLabel(p.month), value: p.amountMinor }));

  function handleBarClick(point: { payload?: { key: string } }) {
    const key = point.payload?.key;
    if (!key) return;
    const params = new URLSearchParams(searchParams);
    // Clicking the already-active month's bar clears the filter instead of
    // re-applying it — otherwise there'd be no way to undo it from the chart.
    if (activeMonth === key) params.delete("month");
    else params.set("month", key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <ChartMountGuard height={200}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={points} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={70}
            tickFormatter={(v: number) => formatMoney(v, currency)}
          />
          <Tooltip
            formatter={(value) => formatMoney(Number(value), currency)}
            contentStyle={{
              fontSize: 12,
              borderRadius: 10,
              background: "var(--popover)",
              borderColor: "var(--border)",
              color: "var(--popover-foreground)",
              boxShadow: "0 4px 16px oklch(0 0 0 / 0.08)",
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            cursor={{ fill: "var(--accent)", opacity: 0.4 }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleBarClick}>
            {points.map((p) => (
              <Cell key={p.key} fill={color} opacity={!activeMonth || p.key === activeMonth ? 1 : 0.35} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartMountGuard>
  );
}

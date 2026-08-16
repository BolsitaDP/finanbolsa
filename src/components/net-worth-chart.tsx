"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import { ChartMountGuard } from "@/components/chart-mount-guard";
import { formatMoney } from "@/lib/format";
import type { NetWorthPoint } from "@/lib/balance";

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const MONTH_LABELS = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  return `${MONTH_LABELS[Number(m) - 1]} ${year.slice(2)}`;
}

export function NetWorthChart({ data, currency, color }: { data: NetWorthPoint[]; currency: string; color: string }) {
  const points = data.map((p) => ({
    month: monthLabel(p.month),
    value: p.totalsByCurrency[currency] ?? 0,
  }));

  return (
    <ChartMountGuard height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={70}
            tickFormatter={(v: number) => formatMoney(v, currency)}
          />
          <Tooltip
            formatter={(value) => formatMoney(Number(value), currency)}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartMountGuard>
  );
}

export { CHART_COLORS };

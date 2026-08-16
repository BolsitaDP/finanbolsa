"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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

export function CategoryTrendChart({
  data,
  currency,
  color,
}: {
  data: MonthlyAmount[];
  currency: string;
  color: string;
}) {
  const points = data.map((p) => ({ month: monthLabel(p.month), value: p.amountMinor }));

  return (
    <ChartMountGuard height={200}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={points} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
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
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartMountGuard>
  );
}

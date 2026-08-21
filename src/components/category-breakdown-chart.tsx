"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Bar, BarChart, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import { ChartMountGuard } from "@/components/chart-mount-guard";
import { CHART_COLORS } from "@/components/net-worth-chart";
import { formatMoney } from "@/lib/format";

export type CategoryBreakdownEntry = {
  categoryId: string;
  name: string;
  amountMinor: number;
};

/**
 * Horizontal bar breakdown of a parent category's spend across its own
 * direct tag ("Sin subcategoría") and each subcategory. Clicking a bar
 * toggles that subcategory into the `subcategory` URL param — same
 * click-to-filter convention as MonthlyTrendChart's `month` param, so it
 * combines with it (both can be active at once) without either component
 * needing to know about the other.
 */
export function CategoryBreakdownChart({
  data,
  currency,
}: {
  data: CategoryBreakdownEntry[];
  currency: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("subcategory");

  function handleClick(point: { payload?: { categoryId: string } }) {
    const key = point.payload?.categoryId;
    if (!key) return;
    const params = new URLSearchParams(searchParams);
    // Clicking the already-active bar clears the filter instead of
    // re-applying it — otherwise there'd be no way to undo it from the chart.
    if (active === key) params.delete("subcategory");
    else params.set("subcategory", key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const height = Math.max(120, data.length * 36);

  return (
    <ChartMountGuard height={height}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatMoney(v, currency)}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={140}
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
          <Bar dataKey="amountMinor" radius={[0, 4, 4, 0]} cursor="pointer" onClick={handleClick}>
            {data.map((d, i) => (
              <Cell
                key={d.categoryId}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                opacity={!active || active === d.categoryId ? 1 : 0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartMountGuard>
  );
}

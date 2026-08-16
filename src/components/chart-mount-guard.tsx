"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * recharts' ResponsiveContainer measures real layout to size a chart, which
 * doesn't exist during server rendering — SSR-ing a chart anyway produces
 * HTML that doesn't match what the client renders once real measurements are
 * available, causing a hydration error. Server and first client render both
 * show the same placeholder (mounted starts false either way); the real
 * chart only swaps in after mount, as an ordinary post-hydration update.
 */
export function ChartMountGuard({ height, children }: { height: number; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  // The whole point is flipping a flag once mounted on the client — there's
  // no render-time substitute for "has this component committed yet".
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="w-full animate-pulse rounded-md bg-muted" style={{ height }} />;
  }
  return <>{children}</>;
}

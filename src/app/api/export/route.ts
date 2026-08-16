import type { NextRequest } from "next/server";

import { buildCsvExport, buildJsonExport, buildXlsxExport } from "@/lib/export";

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const csv = await buildCsvExport();
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="finanbolsa-transacciones-${timestamp}.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const buf = await buildXlsxExport();
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="finanbolsa-${timestamp}.xlsx"`,
      },
    });
  }

  const json = await buildJsonExport();
  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="finanbolsa-backup-${timestamp}.json"`,
    },
  });
}

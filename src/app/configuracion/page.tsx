import { eq } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

export default async function ConfiguracionPage() {
  const [s] = await db.select().from(settings).where(eq(settings.id, "default"));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">Datos generales de la app.</p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Row label="Moneda base" value={s?.baseCurrency ?? "—"} />
          <Row label="Fecha de inicio" value={s?.startDate ? formatDate(s.startDate) : "—"} />
          <Row label="Propietario" value={s?.owner ?? "—"} />
          <Row label="Versión de schema" value={s?.schemaVersion ?? "—"} />
          <Row label="Notas" value={s?.notes ?? "—"} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

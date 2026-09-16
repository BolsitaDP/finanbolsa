import { asc } from "drizzle-orm";

import { db } from "@/db";
import { accounts, categories, payees } from "@/db/schema";
import { ImportWizard } from "@/components/import-wizard";
import { ImportHistoryCard } from "@/components/import-history-card";
import { getAllProjectNames } from "@/app/proyectos/actions";
import { getImportBatches } from "./actions";

// Reads live data with no dynamic API to force Next to treat it as such —
// see the comment in src/app/configuracion/page.tsx for why this matters.
export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const [allAccounts, allCategories, allPayees, projectNames, batches] = await Promise.all([
    db.select().from(accounts).orderBy(asc(accounts.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(payees).orderBy(asc(payees.name)),
    getAllProjectNames(),
    getImportBatches(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Importar</h1>
        <p className="text-sm text-muted-foreground">
          Sube un extracto en PDF de Bancolombia, RappiCard o Nu. Los movimientos se agrupan por
          comercio para que categorices cada uno una sola vez — y puedes guardar la categorización
          como regla para que futuras importaciones se auto-categoricen.
        </p>
      </div>

      <ImportWizard
        accounts={allAccounts}
        categories={allCategories}
        payees={allPayees}
        projectNames={projectNames}
      />

      <ImportHistoryCard batches={batches} />
    </div>
  );
}

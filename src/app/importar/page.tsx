import { asc } from "drizzle-orm";

import { db } from "@/db";
import { accounts, categories, payees } from "@/db/schema";
import { ImportWizard } from "@/components/import-wizard";

export default async function ImportarPage() {
  const [allAccounts, allCategories, allPayees] = await Promise.all([
    db.select().from(accounts).orderBy(asc(accounts.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(payees).orderBy(asc(payees.name)),
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

      <ImportWizard accounts={allAccounts} categories={allCategories} payees={allPayees} />
    </div>
  );
}

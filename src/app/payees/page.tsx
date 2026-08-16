import { asc } from "drizzle-orm";
import { PlusIcon } from "lucide-react";

import { db } from "@/db";
import { categories, payees } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PayeeFormDialog } from "@/components/payee-form-dialog";
import { PayeesTable } from "@/components/payees-table";

export default async function PayeesPage() {
  const [allPayees, allCategories] = await Promise.all([
    db.select().from(payees).orderBy(asc(payees.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payees</h1>
          <p className="text-sm text-muted-foreground">
            Beneficiarios normalizados — base para las reglas de auto-categorización.
          </p>
        </div>
        <PayeeFormDialog
          categories={allCategories}
          trigger={
            <Button size="sm">
              <PlusIcon /> Nuevo payee
            </Button>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{allPayees.length} payees</CardTitle>
        </CardHeader>
        <CardContent>
          <PayeesTable payees={allPayees} categories={allCategories} />
        </CardContent>
      </Card>
    </div>
  );
}

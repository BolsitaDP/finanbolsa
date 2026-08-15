import { asc } from "drizzle-orm";
import { PlusIcon, PencilIcon } from "lucide-react";

import { db } from "@/db";
import { categories, payees } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayeeFormDialog } from "@/components/payee-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { deletePayee } from "./actions";

export default async function PayeesPage() {
  const [allPayees, allCategories] = await Promise.all([
    db.select().from(payees).orderBy(asc(payees.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
  ]);
  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría por defecto</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allPayees.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    {p.defaultCategoryId ? categoryName.get(p.defaultCategoryId) ?? "—" : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.notes ?? "—"}</TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <PayeeFormDialog
                      categories={allCategories}
                      payee={p}
                      trigger={
                        <Button variant="ghost" size="icon-sm">
                          <PencilIcon />
                          <span className="sr-only">Editar</span>
                        </Button>
                      }
                    />
                    <DeleteButton
                      action={deletePayee.bind(null, p.id)}
                      confirmMessage={`¿Eliminar el payee "${p.name}"?`}
                      successMessage="Payee eliminado"
                    />
                  </TableCell>
                </TableRow>
              ))}
              {allPayees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Aún no hay payees. Crea el primero.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

import { asc } from "drizzle-orm";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function CategoriasPage() {
  const allCategories = await db.select().from(categories).orderBy(asc(categories.name));
  const nameById = new Map(allCategories.map((c) => [c.id, c.name]));

  const topLevel = allCategories.filter((c) => !c.parentCategoryId);
  const children = allCategories.filter((c) => c.parentCategoryId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Categorías</h1>
        <p className="text-sm text-muted-foreground">
          {topLevel.length} categorías principales · {children.length} subcategorías.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todas las categorías</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría padre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allCategories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className={c.parentCategoryId ? "pl-6 text-muted-foreground" : "font-medium"}>
                    {c.parentCategoryId ? `↳ ${c.name}` : c.name}
                  </TableCell>
                  <TableCell>
                    {c.parentCategoryId ? nameById.get(c.parentCategoryId) ?? c.parentCategoryId : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.kind === "expense" ? "destructive" : "secondary"}>
                      {c.kind}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

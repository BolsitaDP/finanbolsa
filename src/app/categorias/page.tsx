import { asc } from "drizzle-orm";
import { PlusIcon } from "lucide-react";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryFormDialog } from "@/components/category-form-dialog";
import { CategoriasTable } from "@/components/categorias-table";

export default async function CategoriasPage() {
  const allCategories = await db.select().from(categories).orderBy(asc(categories.name));
  const nameById = new Map(allCategories.map((c) => [c.id, c.name]));

  const topLevel = allCategories.filter((c) => !c.parentCategoryId);
  const children = allCategories.filter((c) => c.parentCategoryId);

  // Group each category with its children right after it (alphabetically
  // within each group), instead of a single flat alphabetical sort — a flat
  // sort scatters a parent's children wherever their own names happen to
  // fall instead of keeping them under their parent.
  const childrenByParent = new Map<string, typeof allCategories>();
  for (const c of children) {
    const key = c.parentCategoryId!;
    if (!nameById.has(key)) continue; // orphaned reference, skip
    const list = childrenByParent.get(key) ?? [];
    list.push(c);
    childrenByParent.set(key, list);
  }
  const orderedCategories = topLevel.flatMap((parent) => [
    parent,
    ...(childrenByParent.get(parent.id) ?? []),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Categorías</h1>
          <p className="text-sm text-muted-foreground">
            {topLevel.length} categorías principales · {children.length} subcategorías.
          </p>
        </div>
        <CategoryFormDialog
          categories={allCategories}
          trigger={
            <Button size="sm">
              <PlusIcon /> Nueva categoría
            </Button>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Categorías por tipo</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoriasTable categories={allCategories} orderedCategories={orderedCategories} />
        </CardContent>
      </Card>
    </div>
  );
}

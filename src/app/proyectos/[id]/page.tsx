import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ArrowLeftIcon, PencilIcon, XIcon } from "lucide-react";

import { db } from "@/db";
import { accounts, categories, payees, projects, transactions, transactionSplits } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import { MonthlyTrendChart } from "@/components/monthly-trend-chart";
import { TransaccionesTable } from "@/components/transacciones-table";
import { CHART_COLORS } from "@/components/net-worth-chart";
import { getAllProjectNames } from "@/app/proyectos/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { monthKey, monthlyAmounts } from "@/lib/spending-stats";
import { groupSplitsByTransaction } from "@/lib/splits";

const PROJECT_TYPES: Record<string, string> = { project: "Proyecto", trip: "Viaje" };

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month } = await searchParams;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });

  if (!project) notFound();

  const [projectTx, allAccounts, allCategories, allPayees, allSplits, projectNames] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.projectTrip, project.name), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.date)),
    db.select().from(accounts),
    db.select().from(categories),
    db.select().from(payees),
    db.select().from(transactionSplits),
    getAllProjectNames(),
  ]);

  const currencies = [...new Set(projectTx.map((tx) => tx.currency))];
  const totalsByType = new Map<string, Map<string, number>>();
  for (const tx of projectTx) {
    if (tx.type !== "expense" && tx.type !== "income") continue;
    const totals = totalsByType.get(tx.type) ?? new Map<string, number>();
    totals.set(tx.currency, (totals.get(tx.currency) ?? 0) + tx.amountMinor);
    totalsByType.set(tx.type, totals);
  }

  const filteredProjectTx = month ? projectTx.filter((tx) => monthKey(tx.date) === month) : projectTx;
  const splitsByTx = groupSplitsByTransaction(allSplits);
  const projectNamesWithCurrent = projectNames.includes(project.name) ? projectNames : [project.name, ...projectNames];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            nativeButton={false}
            render={<Link href="/proyectos" />}
          >
            <ArrowLeftIcon /> Proyectos / Viajes
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <Badge variant="outline">{PROJECT_TYPES[project.type] ?? project.type}</Badge>
            {project.archivedAt && <Badge variant="secondary">Archivado</Badge>}
          </div>
          {(project.startDate || project.endDate) && (
            <p className="text-sm text-muted-foreground">
              {project.startDate && `Desde ${formatDate(project.startDate)}`}
              {project.startDate && project.endDate && " — "}
              {project.endDate && `Hasta ${formatDate(project.endDate)}`}
            </p>
          )}
          {project.notes && <p className="text-sm text-muted-foreground">{project.notes}</p>}
        </div>
        <ProjectFormDialog
          project={project}
          trigger={
            <Button variant="outline" size="sm">
              <PencilIcon /> Editar
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {currencies.map((currency) => (
          <Card key={currency}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Resumen {currency}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xl font-semibold text-destructive">
                  {formatMoney(totalsByType.get("expense")?.get(currency) ?? 0, currency)}
                </p>
                <p className="text-xs text-muted-foreground">Gastos</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-success">
                  {formatMoney(totalsByType.get("income")?.get(currency) ?? 0, currency)}
                </p>
                <p className="text-xs text-muted-foreground">Ingresos</p>
              </div>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Actividad</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{projectTx.length}</p>
            <p className="text-xs text-muted-foreground">Movimientos registrados</p>
          </CardContent>
        </Card>
      </div>

      {currencies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tendencia de gastos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {currencies.map((currency, index) => {
              const expenseTx = projectTx.filter((tx) => tx.type === "expense" && tx.currency === currency);
              if (expenseTx.length === 0) return null;
              return (
                <div key={currency} className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-muted-foreground">{currency}</span>
                  <MonthlyTrendChart
                    data={monthlyAmounts(expenseTx, 12)}
                    currency={currency}
                    color={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{filteredProjectTx.length} transacciones</CardTitle>
            {month && (
              <Link
                href={`/proyectos/${project.id}`}
                className="flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Filtrado por {month} <XIcon className="size-3" />
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredProjectTx.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {month ? "No hay transacciones de este proyecto en ese mes." : "Todavía no hay transacciones asociadas."}
            </p>
          ) : (
            <TransaccionesTable
              transactions={filteredProjectTx}
              accounts={allAccounts}
              categories={allCategories}
              payees={allPayees}
              projectNames={projectNamesWithCurrent}
              splitsByTx={splitsByTx}
            />
          )}
        </CardContent>
      </Card>

      {currencies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumen por moneda</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Gastos</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currencies.map((currency) => (
                  <TableRow key={currency}>
                    <TableCell className="font-medium">{currency}</TableCell>
                    <TableCell className="text-right text-destructive">
                      {formatMoney(totalsByType.get("expense")?.get(currency) ?? 0, currency)}
                    </TableCell>
                    <TableCell className="text-right text-success">
                      {formatMoney(totalsByType.get("income")?.get(currency) ?? 0, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

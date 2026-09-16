"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, ArchiveIcon, RotateCcwIcon, MapPinIcon, BriefcaseIcon, ArrowRightIcon } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import { DeleteButton } from "@/components/delete-button";
import { archiveProject, unarchiveProject, deleteProject } from "@/app/proyectos/actions";
import { formatDate, formatMoney } from "@/lib/format";

const PROJECT_TYPES: Record<string, string> = { project: "Proyecto", trip: "Viaje" };

type Project = {
  id: string;
  name: string;
  type: string;
  color: string | null;
  startDate: Date | null;
  endDate: Date | null;
  notes: string | null;
  archivedAt: Date | null;
};
type ProjectStats = {
  expense: Record<string, number>;
  income: Record<string, number>;
  transactionCount: number;
};

export function ProjectsGrid({
  projects,
  stats,
}: {
  projects: Project[];
  stats: Record<string, ProjectStats>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Proyectos / Viajes</h1>
          <p className="text-sm text-muted-foreground">
            Organiza tus gastos e ingresos por proyecto o viaje.
          </p>
        </div>
        <ProjectFormDialog
          trigger={
            <Button size="sm">
              <PlusIcon /> Nuevo
            </Button>
          }
        />
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-muted-foreground">No hay proyectos ni viajes creados.</p>
            <ProjectFormDialog
              trigger={
                <Button variant="link" className="mt-2">
                  Crear el primero
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} stats={stats[project.name]} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, stats }: { project: Project; stats?: ProjectStats }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const expenseTotal = stats ? Object.values(stats.expense).reduce((a, b) => a + b, 0) : 0;
  const incomeTotal = stats ? Object.values(stats.income).reduce((a, b) => a + b, 0) : 0;
  const txCount = stats?.transactionCount ?? 0;
  // Every account in this app currently settles in COP, so a single-currency
  // total is a reasonable summary here — same simplification the rest of the
  // project stats already make (see getProjectsStats).
  const currency = "COP";

  function toggleArchive() {
    startTransition(async () => {
      try {
        if (project.archivedAt) {
          await unarchiveProject(project.id);
          toast.success("Proyecto/viaje restaurado");
        } else {
          await archiveProject(project.id);
          toast.success("Proyecto/viaje archivado");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al actualizar");
      }
    });
  }

  function openProject() {
    router.push(`/proyectos/${project.id}`);
  }

  return (
    <Card
      className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
      onClick={openProject}
    >
      {project.color && <div className={`h-1 w-full ${project.color}`} />}
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {project.type === "trip" ? <MapPinIcon className="size-3" /> : <BriefcaseIcon className="size-3" />}
            {PROJECT_TYPES[project.type] ?? project.type}
          </Badge>
          {project.archivedAt && (
            <Badge variant="secondary" className="text-xs">
              Archivado
            </Badge>
          )}
        </div>
        <h3 className="truncate font-medium">
          <Link href={`/proyectos/${project.id}`} className="hover:underline">
            {project.name}
          </Link>
        </h3>
        {(project.startDate || project.endDate) && (
          <p className="text-xs text-muted-foreground">
            {project.startDate && `Desde ${formatDate(project.startDate)}`}
            {project.startDate && project.endDate && " — "}
            {project.endDate && `Hasta ${formatDate(project.endDate)}`}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {project.notes && <p className="line-clamp-2 text-sm text-muted-foreground">{project.notes}</p>}

        <Separator />

        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-semibold text-destructive">
              {expenseTotal > 0 ? formatMoney(expenseTotal, currency) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Gastos</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-success">
              {incomeTotal > 0 ? formatMoney(incomeTotal, currency) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Ingresos</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{txCount}</p>
            <p className="text-xs text-muted-foreground">Movimientos</p>
          </div>
        </div>

        <Separator />

        <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            nativeButton={false}
            render={<Link href={`/proyectos/${project.id}`} />}
          >
            Ver detalle <ArrowRightIcon />
          </Button>
          <ProjectFormDialog
            project={project}
            trigger={
              <Button variant="outline" size="sm" className="flex-1">
                Editar
              </Button>
            }
          />
          <Button variant="outline" size="sm" disabled={isPending} onClick={toggleArchive}>
            {project.archivedAt ? <RotateCcwIcon /> : <ArchiveIcon />}
            <span className="sr-only">{project.archivedAt ? "Restaurar" : "Archivar"}</span>
          </Button>
          <DeleteButton
            action={deleteProject.bind(null, project.id)}
            confirmMessage={`¿Eliminar "${project.name}"? Esta acción no se puede deshacer. Las transacciones que lo usan mantienen el nombre como texto suelto.`}
            successMessage="Proyecto/viaje eliminado"
          />
        </div>
      </CardContent>
    </Card>
  );
}

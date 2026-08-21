import { asc } from "drizzle-orm";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { ProjectsGrid } from "@/components/projects-grid";
import { getProjectsStats } from "./actions";

export default async function ProyectosPage() {
  const [allProjects, stats] = await Promise.all([
    db.select().from(projects).orderBy(asc(projects.name)),
    getProjectsStats(),
  ]);

  const statsByName = Object.fromEntries(
    Object.entries(stats).map(([name, s]) => [
      name,
      { expense: s.expense, income: s.income, transactionCount: s.transactionCount },
    ])
  );

  return <ProjectsGrid projects={allProjects} stats={statsByName} />;
}

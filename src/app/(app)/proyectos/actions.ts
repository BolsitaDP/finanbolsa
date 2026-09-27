"use server";

import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { projects, transactions } from "@/db/schema";
import { uniqueId } from "@/lib/slug";

type ProjectInput = {
  name: string;
  type: "project" | "trip";
  color?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  notes?: string | null;
};

function revalidateAll() {
  revalidatePath("/proyectos");
  revalidatePath("/proyectos/[id]", "page");
  revalidatePath("/transacciones");
  revalidatePath("/importar");
  revalidatePath("/");
}

export async function createProject(input: ProjectInput) {
  const existing = await db.select({ id: projects.id }).from(projects);
  const id = uniqueId("proj", input.name, existing.map((p) => p.id));
  await db.insert(projects).values({
    id,
    ...input,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  revalidateAll();
}

export async function updateProject(id: string, input: Partial<ProjectInput>) {
  await db
    .update(projects)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(projects.id, id));
  revalidateAll();
}

export async function archiveProject(id: string) {
  await db
    .update(projects)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, id));
  revalidateAll();
}

export async function unarchiveProject(id: string) {
  await db
    .update(projects)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(projects.id, id));
  revalidateAll();
}

export async function deleteProject(id: string) {
  await db.delete(projects).where(eq(projects.id, id));
  revalidateAll();
}

export async function getProjectsStats() {
  const allProjects = await db.select().from(projects).where(isNull(projects.archivedAt));
  const allTransactions = await db
    .select()
    .from(transactions)
    .where(isNull(transactions.deletedAt));

  const stats: Record<
    string,
    {
      project: typeof allProjects[0];
      expense: Record<string, number>;
      income: Record<string, number>;
      transactionCount: number;
    }
  > = {};

  for (const p of allProjects) {
    stats[p.name] = {
      project: p,
      expense: {},
      income: {},
      transactionCount: 0,
    };
  }

  for (const tx of allTransactions) {
    const pt = tx.projectTrip;
    if (!pt || !stats[pt]) continue;
    stats[pt].transactionCount++;
    const curr = tx.currency;
    if (tx.type === "expense") {
      stats[pt].expense[curr] = (stats[pt].expense[curr] ?? 0) + tx.amountMinor;
    } else if (tx.type === "income") {
      stats[pt].income[curr] = (stats[pt].income[curr] ?? 0) + tx.amountMinor;
    }
  }

  return stats;
}

export async function getAllProjectNames() {
  const allProjects = await db
    .select({ name: projects.name })
    .from(projects)
    .where(isNull(projects.archivedAt))
    .orderBy(projects.name);
  return allProjects.map((p) => p.name);
}
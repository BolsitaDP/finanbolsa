"use server";

import { and, desc, isNull, like } from "drizzle-orm";

import { db } from "@/db";
import { accounts, categories, payees, transactions } from "@/db/schema";
import { formatDate, formatMoney } from "@/lib/format";

export type SearchResult = {
  type: "category" | "payee" | "account" | "transaction";
  id: string;
  label: string;
  sublabel: string;
};

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${q}%`;

  const [categoryRows, payeeRows, accountRows, txRows] = await Promise.all([
    db.select().from(categories).where(like(categories.name, pattern)).limit(5),
    db.select().from(payees).where(like(payees.name, pattern)).limit(5),
    db.select().from(accounts).where(like(accounts.name, pattern)).limit(5),
    db
      .select()
      .from(transactions)
      .where(and(isNull(transactions.deletedAt), like(transactions.description, pattern)))
      .orderBy(desc(transactions.date))
      .limit(6),
  ]);

  return [
    ...categoryRows.map((c) => ({
      type: "category" as const,
      id: c.id,
      label: c.name,
      sublabel: c.kind === "income" ? "Categoría · Ingreso" : "Categoría · Gasto",
    })),
    ...payeeRows.map((p) => ({
      type: "payee" as const,
      id: p.id,
      label: p.name,
      sublabel: "Payee",
    })),
    ...accountRows.map((a) => ({
      type: "account" as const,
      id: a.id,
      label: a.name,
      sublabel: `Cuenta · ${a.currency}`,
    })),
    ...txRows.map((t) => ({
      type: "transaction" as const,
      id: String(t.id),
      label: t.description || "(sin descripción)",
      sublabel: `Transacción · ${formatDate(t.date)} · ${formatMoney(t.amountMinor, t.currency)}`,
    })),
  ];
}

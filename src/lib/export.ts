import { isNull } from "drizzle-orm";
import * as XLSX from "xlsx";

import { db } from "@/db";
import { accounts, budgets, categories, payees, rules, settings, transactions } from "@/db/schema";

const TYPE_LABELS: Record<string, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
};

async function fetchAll() {
  const [allAccounts, allCategories, allPayees, allRules, allBudgets, allTransactions, settingsRows] =
    await Promise.all([
      db.select().from(accounts),
      db.select().from(categories),
      db.select().from(payees),
      db.select().from(rules),
      db.select().from(budgets),
      // Soft-deleted transactions are gone as far as the app is concerned —
      // an export should reflect what the user actually sees, not the trash.
      db.select().from(transactions).where(isNull(transactions.deletedAt)),
      db.select().from(settings),
    ]);
  return {
    allAccounts,
    allCategories,
    allPayees,
    allRules,
    allBudgets,
    allTransactions,
    settingsRow: settingsRows[0] ?? null,
  };
}

type FetchedData = Awaited<ReturnType<typeof fetchAll>>;

function nameMaps(data: FetchedData) {
  return {
    accountName: new Map(data.allAccounts.map((a) => [a.id, a.name])),
    categoryName: new Map(data.allCategories.map((c) => [c.id, c.name])),
    payeeName: new Map(data.allPayees.map((p) => [p.id, p.name])),
  };
}

function resolvedTransactionRows(data: FetchedData) {
  const { accountName, categoryName, payeeName } = nameMaps(data);
  return data.allTransactions.map((t) => ({
    Fecha: t.date.toISOString().slice(0, 10),
    Tipo: TYPE_LABELS[t.type] ?? t.type,
    Cuenta: accountName.get(t.accountId) ?? t.accountId,
    "Cuenta destino": t.destinationAccountId
      ? (accountName.get(t.destinationAccountId) ?? t.destinationAccountId)
      : "",
    Monto: t.amountMinor,
    Moneda: t.currency,
    Categoría: t.categoryId ? (categoryName.get(t.categoryId) ?? t.categoryId) : "",
    Payee: t.payeeId ? (payeeName.get(t.payeeId) ?? t.payeeId) : "",
    Descripción: t.description ?? "",
    "Proyecto/Viaje": t.projectTrip ?? "",
    Notas: t.notes ?? "",
  }));
}

/** Full-fidelity backup: raw rows as stored, for restoring or migrating. */
export async function buildJsonExport(): Promise<string> {
  const data = await fetchAll();
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      accounts: data.allAccounts,
      categories: data.allCategories,
      payees: data.allPayees,
      rules: data.allRules,
      budgets: data.allBudgets,
      transactions: data.allTransactions,
      settings: data.settingsRow,
    },
    null,
    2
  );
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Transactions only, with names resolved instead of raw ids — for opening
 * straight in a spreadsheet. */
export async function buildCsvExport(): Promise<string> {
  const data = await fetchAll();
  const rows = resolvedTransactionRows(data);
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape((row as Record<string, unknown>)[h])).join(","));
  }
  // Leading BOM so Excel opens the accented headers (Categoría, ...) as UTF-8
  // instead of guessing a different codepage.
  return "﻿" + lines.join("\n");
}

/** One workbook, one sheet per entity — the closest match to the original
 * Gastos.xlsx this app grew out of. */
export async function buildXlsxExport(): Promise<Buffer> {
  const data = await fetchAll();
  const { categoryName, payeeName, accountName } = nameMaps(data);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resolvedTransactionRows(data)), "Transacciones");

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      data.allAccounts.map((a) => ({
        Nombre: a.name,
        Tipo: a.type,
        Moneda: a.currency,
        Estado: a.status,
        "Saldo de referencia": a.referenceBalanceMinor,
        "Fecha de referencia": a.referenceDate.toISOString().slice(0, 10),
        "Cupo de crédito": a.creditLimitMinor ?? "",
        Notas: a.notes ?? "",
      }))
    ),
    "Cuentas"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      data.allCategories.map((c) => ({
        Nombre: c.name,
        Tipo: c.kind === "income" ? "Ingreso" : "Gasto",
        "Categoría padre": c.parentCategoryId ? (categoryName.get(c.parentCategoryId) ?? "") : "",
        Estado: c.status,
        Notas: c.notes ?? "",
      }))
    ),
    "Categorías"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      data.allPayees.map((p) => ({
        Nombre: p.name,
        "Categoría por defecto": p.defaultCategoryId ? (categoryName.get(p.defaultCategoryId) ?? "") : "",
        Notas: p.notes ?? "",
      }))
    ),
    "Payees"
  );

  function resolveValue(field: string, value: string) {
    if (field === "accountId") return accountName.get(value) ?? value;
    if (field === "payeeId") return payeeName.get(value) ?? value;
    if (field === "categoryId") return categoryName.get(value) ?? value;
    return value;
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      data.allRules.map((r) => ({
        Nombre: r.name ?? "",
        Activa: r.enabled ? "Sí" : "No",
        "Coincide si": r.matchType === "any" ? "Alguna condición" : "Todas las condiciones",
        Condiciones: r.conditions.map((c) => `${c.field} ${c.op} "${resolveValue(c.field, c.value)}"`).join(" | "),
        Acciones: r.actions.map((a) => `${a.field} = "${resolveValue(a.field, a.value)}"`).join(" | "),
      }))
    ),
    "Reglas"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      data.allBudgets.map((b) => ({
        Categoría: categoryName.get(b.categoryId) ?? b.categoryId,
        Mes: b.month,
        Presupuestado: b.budgetedMinor,
      }))
    ),
    "Presupuesto"
  );

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

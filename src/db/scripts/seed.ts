/**
 * One-time import of the original Gastos.xlsx into the local SQLite db.
 * Usage: npm run db:seed -- [path/to/Gastos.xlsx]
 * Defaults to the file the app was bootstrapped from, in Downloads.
 */
import path from "node:path";
import os from "node:os";
import XLSX from "xlsx";

import { db } from "../index";
import { accounts, categories, settings, transactions } from "../schema";

const filePath =
  process.argv[2] ?? path.join(os.homedir(), "Downloads", "Gastos.xlsx");

function sheetRows(wb: XLSX.WorkBook, name: string) {
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`Sheet "${name}" not found in ${filePath}`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: true,
  });
}

function toDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value);
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
  }
  return new Date(String(value));
}

async function main() {
  console.log(`Reading ${filePath}...`);
  const wb = XLSX.readFile(filePath, { cellDates: true });

  // --- accounts -----------------------------------------------------------
  const accountRows = sheetRows(wb, "Accounts");
  for (const row of accountRows) {
    if (!row.account_id) continue;
    await db
      .insert(accounts)
      .values({
        id: String(row.account_id),
        name: String(row.name),
        type: String(row.type),
        currency: String(row.currency),
        creditLimitMinor: row.credit_limit_minor != null ? Number(row.credit_limit_minor) : null,
        status: String(row.status ?? "active"),
        openedAt: toDate(row.opened_at),
        notes: row.notes ? String(row.notes) : null,
        referenceDate: toDate(row.reference_date)!,
        referenceBalanceMinor: Number(row.reference_balance_minor ?? 0),
      })
      .onConflictDoNothing();
  }
  console.log(`  accounts: ${accountRows.length}`);

  // --- categories -----------------------------------------------------------
  const categoryRows = sheetRows(wb, "Categories");
  for (const row of categoryRows) {
    if (!row.category_id) continue;
    await db
      .insert(categories)
      .values({
        id: String(row.category_id),
        name: String(row.name),
        parentCategoryId: row.parent_category_id ? String(row.parent_category_id) : null,
        kind: String(row.kind),
        status: String(row.status ?? "active"),
        notes: row.notes ? String(row.notes) : null,
      })
      .onConflictDoNothing();
  }
  console.log(`  categories: ${categoryRows.length}`);

  // --- settings (key/value rows in columns A/B) -----------------------------
  const settingsSheet = wb.Sheets["Settings"];
  const settingsRows = XLSX.utils.sheet_to_json<{ Setting?: string; Value?: unknown }>(
    settingsSheet,
    { raw: true }
  );
  const settingsMap = new Map(settingsRows.map((r) => [r.Setting, r.Value]));
  await db
    .insert(settings)
    .values({
      id: "default",
      schemaVersion: String(settingsMap.get("schema_version") ?? "2.0"),
      baseCurrency: String(settingsMap.get("base_currency") ?? "COP"),
      startDate: toDate(settingsMap.get("start_date")) ?? new Date(),
      owner: settingsMap.get("owner") ? String(settingsMap.get("owner")) : null,
      notes: settingsMap.get("notes") ? String(settingsMap.get("notes")) : null,
    })
    .onConflictDoNothing();
  console.log("  settings: 1");

  // --- transactions -----------------------------------------------------------
  const transactionRows = sheetRows(wb, "Transactions");
  let count = 0;
  let skipped = 0;
  for (const row of transactionRows) {
    if (!row.transaction_id) continue;
    const date = toDate(row.date);
    if (!date || !row.type || !row.amount_minor) {
      // Incomplete row (id/account present but no date/type/amount) — not a
      // real transaction, skip it.
      skipped++;
      continue;
    }
    await db
      .insert(transactions)
      .values({
        id: Number(row.transaction_id),
        date,
        type: String(row.type),
        accountId: String(row.account_id),
        destinationAccountId: row.destination_account_id ? String(row.destination_account_id) : null,
        amountMinor: Number(row.amount_minor),
        currency: String(row.currency),
        destinationAmountMinor:
          row.destination_amount_minor != null ? Number(row.destination_amount_minor) : null,
        destinationCurrency: row.destination_currency ? String(row.destination_currency) : null,
        categoryId: row.category_id ? String(row.category_id) : null,
        description: row.description ? String(row.description) : null,
        projectTrip: row.project_trip ? String(row.project_trip) : null,
        notes: row.notes ? String(row.notes) : null,
        createdAt: toDate(row.created_at) ?? date,
        updatedAt: toDate(row.updated_at) ?? date,
        deletedAt: toDate(row.deleted_at) ?? null,
      })
      .onConflictDoNothing();
    count++;
  }
  console.log(`  transactions: ${count} (skipped ${skipped} incomplete rows)`);

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

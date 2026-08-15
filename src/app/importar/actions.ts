"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { accounts, categories, payees, rules, transactions } from "@/db/schema";
import { parseBancolombiaStatement } from "@/lib/statement-parser";
import { cleanMerchantName } from "@/lib/merchant";
import type { ImportGroupInput, ParsedGroup, ParsedTransaction } from "@/lib/import-types";
import type { Currency } from "@/lib/enums";

export async function parseStatement(accountId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No se recibió ningún archivo");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const rows = await parseBancolombiaStatement(bytes);
  if (rows.length === 0) {
    throw new Error("No se encontraron movimientos en el PDF. ¿Es un extracto de Bancolombia?");
  }

  const groupsByKey = new Map<string, ParsedTransaction[]>();
  const rawByKey = new Map<string, string>();
  for (const row of rows) {
    const key = cleanMerchantName(row.description);
    const list = groupsByKey.get(key) ?? [];
    list.push({ date: row.date.toISOString(), description: row.description, amountMinor: row.amountMinor });
    groupsByKey.set(key, list);
    if (!rawByKey.has(key)) rawByKey.set(key, row.description);
  }

  const dates = rows.map((r) => r.date);
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  const [existingPayees, existingRules, existingTx] = await Promise.all([
    db.select().from(payees),
    db.select().from(rules).where(eq(rules.enabled, true)),
    db
      .select({ date: transactions.date, amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          isNull(transactions.deletedAt),
          gte(transactions.date, minDate),
          lte(transactions.date, maxDate)
        )
      ),
  ]);

  const existingKeys = new Set(
    existingTx.map((t) => `${t.date.toISOString().slice(0, 10)}|${t.amountMinor}`)
  );

  const groups: ParsedGroup[] = [...groupsByKey.entries()]
    .map(([key, txs]) => {
      const totalAmountMinor = txs.reduce((s, t) => s + t.amountMinor, 0);
      const rawDescription = rawByKey.get(key)!;
      const duplicateCount = txs.filter(
        (t) => existingKeys.has(`${t.date.slice(0, 10)}|${Math.abs(t.amountMinor)}`)
      ).length;

      let suggestedPayeeId: string | null = null;
      let suggestedCategoryId: string | null = null;

      const matchedPayee = existingPayees.find((p) => p.name.toLowerCase() === key.toLowerCase());
      if (matchedPayee) {
        suggestedPayeeId = matchedPayee.id;
        suggestedCategoryId = matchedPayee.defaultCategoryId;
      }

      for (const rule of existingRules) {
        const conditions = rule.conditions;
        const descConditions = conditions.filter((c) => c.field === "description" && c.op === "contains");
        if (descConditions.length === 0) continue;
        const matches = descConditions.every((c) =>
          rawDescription.toLowerCase().includes(c.value.toLowerCase())
        );
        if (!matches) continue;
        for (const action of rule.actions) {
          if (action.field === "categoryId") suggestedCategoryId = action.value;
          if (action.field === "payeeId") suggestedPayeeId = action.value;
        }
      }

      return {
        key,
        merchantLabel: key,
        count: txs.length,
        totalAmountMinor,
        sampleDescription: rawDescription,
        type: totalAmountMinor < 0 ? ("expense" as const) : ("income" as const),
        transactions: txs,
        suggestedPayeeId,
        suggestedCategoryId,
        duplicateCount,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { groups, totalTransactions: rows.length };
}

export async function bulkImportTransactions(
  accountId: string,
  currency: Currency,
  groups: ImportGroupInput[]
) {
  // These IDs were captured in the browser when the import page loaded, and
  // can go stale if the underlying data was reset (e.g. via the danger zone)
  // in the meantime. Re-validate against the current DB instead of letting a
  // dangling reference crash the whole import with a raw FK error.
  const [validAccounts, validCategories, existingPayees, existingRulesRaw] = await Promise.all([
    db.select({ id: accounts.id }).from(accounts),
    db.select({ id: categories.id }).from(categories),
    db.select().from(payees),
    db.select({ conditions: rules.conditions }).from(rules),
  ]);
  const validAccountIds = new Set(validAccounts.map((a) => a.id));
  const validCategoryIds = new Set(validCategories.map((c) => c.id));
  const validPayeeIds = new Set(existingPayees.map((p) => p.id));

  if (!validAccountIds.has(accountId)) {
    throw new Error(
      "Esa cuenta ya no existe (puede que se haya borrado desde Configuración). Recarga la página e intenta de nuevo."
    );
  }

  const payeeByName = new Map(existingPayees.map((p) => [p.name.toLowerCase(), p]));
  const ruleSignatures = new Set(existingRulesRaw.map((r) => JSON.stringify(r.conditions)));

  let imported = 0;
  let skippedDuplicates = 0;
  let rulesCreated = 0;

  for (const rawGroup of groups) {
    if (rawGroup.skip) continue;

    const isTransfer = rawGroup.type === "transfer";
    const group: ImportGroupInput = {
      ...rawGroup,
      // Transfers don't carry a category/payee — matches the regular
      // transaction form's convention.
      categoryId:
        !isTransfer && rawGroup.categoryId && validCategoryIds.has(rawGroup.categoryId)
          ? rawGroup.categoryId
          : null,
      payeeId:
        !isTransfer && rawGroup.payeeId && validPayeeIds.has(rawGroup.payeeId)
          ? rawGroup.payeeId
          : null,
      newPayeeName: !isTransfer ? rawGroup.newPayeeName : null,
      destinationAccountId:
        isTransfer && rawGroup.destinationAccountId && validAccountIds.has(rawGroup.destinationAccountId)
          ? rawGroup.destinationAccountId
          : null,
    };

    let payeeId = group.payeeId;
    if (!payeeId && group.newPayeeName) {
      const existing = payeeByName.get(group.newPayeeName.toLowerCase());
      if (existing) {
        payeeId = existing.id;
      } else {
        payeeId = randomUUID();
        await db.insert(payees).values({
          id: payeeId,
          name: group.newPayeeName,
          defaultCategoryId: group.categoryId,
        });
        payeeByName.set(group.newPayeeName.toLowerCase(), {
          id: payeeId,
          name: group.newPayeeName,
          defaultCategoryId: group.categoryId,
          notes: null,
        });
      }
    }

    for (const tx of group.transactions) {
      const date = new Date(tx.date);
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dupes = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.accountId, accountId),
            isNull(transactions.deletedAt),
            eq(transactions.amountMinor, Math.abs(tx.amountMinor)),
            gte(transactions.date, dayStart),
            lte(transactions.date, dayEnd)
          )
        );
      if (dupes.length > 0) {
        skippedDuplicates++;
        continue;
      }

      await db.insert(transactions).values({
        date,
        type: group.type,
        accountId,
        destinationAccountId: group.destinationAccountId,
        amountMinor: Math.abs(tx.amountMinor),
        currency,
        categoryId: group.categoryId,
        payeeId,
        description: tx.description,
        notes: "Importado de extracto Bancolombia",
      });
      imported++;
    }

    if (group.createRule && group.categoryId) {
      const conditions = [{ field: "description" as const, op: "contains" as const, value: group.merchantLabel }];
      const signature = JSON.stringify(conditions);
      if (!ruleSignatures.has(signature)) {
        const actions = [
          { field: "categoryId" as const, value: group.categoryId },
          ...(payeeId ? [{ field: "payeeId" as const, value: payeeId }] : []),
        ];
        await db.insert(rules).values({ name: group.merchantLabel, conditions, actions, sortOrder: 999 });
        ruleSignatures.add(signature);
        rulesCreated++;
      }
    }
  }

  revalidatePath("/transacciones");
  revalidatePath("/payees");
  revalidatePath("/reglas");
  revalidatePath("/cuentas");
  revalidatePath("/");
  revalidatePath("/presupuesto");

  return { imported, skippedDuplicates, rulesCreated };
}

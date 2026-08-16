"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { accounts, categories, payees, rules, transactions } from "@/db/schema";
import { parseBancolombiaStatement, parseNuStatement, parseRappicardStatement } from "@/lib/statement-parser";
import { cleanMerchantName } from "@/lib/merchant";
import { ruleMatches } from "@/lib/rules";
import type { ImportGroupInput, ParsedGroup, ParsedTransaction } from "@/lib/import-types";
import type { Currency } from "@/lib/enums";
import type { RuleMatchType } from "@/lib/rules-types";

// Matches on date+amount+description, not just date+amount: credit card
// statements routinely have two unrelated charges for the same amount on the
// same day (two coffees, two identical festival wristbands), and matching on
// amount alone was silently dropping the second one as a false "duplicate".
function dupSignature(dateIso: string, amountMinor: number, description: string) {
  return `${dateIso.slice(0, 10)}|${Math.abs(amountMinor)}|${description}`;
}

export async function parseStatement(accountId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No se recibió ningún archivo");

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  // Try each known statement layout in turn — their row patterns are
  // distinct enough (slash vs. ISO dates, different decimal formats) that a
  // parser built for one format won't spuriously match rows from another.
  // Each parser gets its own real copy via .slice() (not just a new
  // Uint8Array view over the same ArrayBuffer): pdfjs transfers the buffer
  // to its worker internally, which detaches it, so a shared buffer breaks
  // the second parse.
  const bancolombiaRows = await parseBancolombiaStatement(fileBytes.slice());
  const rappicardRows = bancolombiaRows.length > 0 ? [] : await parseRappicardStatement(fileBytes.slice());
  const rows =
    bancolombiaRows.length > 0
      ? bancolombiaRows
      : rappicardRows.length > 0
        ? rappicardRows
        : await parseNuStatement(fileBytes.slice());
  if (rows.length === 0) {
    throw new Error(
      "No se encontraron movimientos en el PDF. Formatos soportados: extracto de Bancolombia, RappiCard o Nu."
    );
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
    db.select().from(rules).where(eq(rules.enabled, true)).orderBy(asc(rules.sortOrder)),
    db
      .select({
        date: transactions.date,
        amountMinor: transactions.amountMinor,
        description: transactions.description,
      })
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

  // A budget of remaining matches per signature, decremented as groups claim
  // them below — so N existing rows only ever mark N (not all) same-signature
  // new rows as duplicates.
  const existingCounts = new Map<string, number>();
  for (const t of existingTx) {
    const key = dupSignature(t.date.toISOString(), t.amountMinor, t.description ?? "");
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }

  const groups: ParsedGroup[] = [...groupsByKey.entries()]
    .map(([key, txs]) => {
      const totalAmountMinor = txs.reduce((s, t) => s + t.amountMinor, 0);
      const rawDescription = rawByKey.get(key)!;
      const duplicateCount = txs.filter((t) => {
        const sig = dupSignature(t.date, t.amountMinor, t.description);
        const remaining = existingCounts.get(sig) ?? 0;
        if (remaining === 0) return false;
        existingCounts.set(sig, remaining - 1);
        return true;
      }).length;

      let suggestedPayeeId: string | null = null;
      let suggestedCategoryId: string | null = null;

      const matchedPayee = existingPayees.find((p) => p.name.toLowerCase() === key.toLowerCase());
      if (matchedPayee) {
        suggestedPayeeId = matchedPayee.id;
        suggestedCategoryId = matchedPayee.defaultCategoryId;
      }

      for (const rule of existingRules) {
        // A group merges several raw rows under one merchant label, so a
        // rule (e.g. an amount threshold) is applied if it matches any one
        // of them — matches the "any row" granularity a group can act on.
        const matches = txs.some((t) =>
          ruleMatches(
            { description: t.description, payeeId: null, accountId, amountMinor: Math.abs(t.amountMinor) },
            rule.conditions,
            rule.matchType as RuleMatchType
          )
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

  // Same budget-based dedup as the preview in parseStatement: fetched once
  // up front rather than re-queried per row, so a batch that legitimately
  // contains two same-day, same-amount, same-description charges (re-running
  // the same import twice) is distinguished from one that just happens to
  // have two unrelated same-amount charges on the same day.
  const existingForAccount = await db
    .select({
      date: transactions.date,
      amountMinor: transactions.amountMinor,
      description: transactions.description,
    })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt)));
  const existingCounts = new Map<string, number>();
  for (const t of existingForAccount) {
    const key = dupSignature(t.date.toISOString(), t.amountMinor, t.description ?? "");
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }

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
      const sig = dupSignature(tx.date, tx.amountMinor, tx.description);
      const remaining = existingCounts.get(sig) ?? 0;
      if (remaining > 0) {
        existingCounts.set(sig, remaining - 1);
        skippedDuplicates++;
        continue;
      }

      const date = new Date(tx.date);
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
        notes: "Importado de extracto",
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

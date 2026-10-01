import { z } from "zod";

import { CURRENCIES, TRANSACTION_TYPES } from "@/lib/enums";

/**
 * Validation for Server Actions.
 *
 * Until now every form declared its own zod schema and lived entirely in the
 * client. That protects the UI but not the data: the TypeScript types on a
 * `"use server"` export are compile-time only, and a server action is just an
 * HTTP endpoint that accepts whatever JSON it is posted. `bulkUpdateTransactions`
 * would happily accept `type: "banana"`, and would accept `type: "transfer"`
 * with no destination account — which silently destroys the user's net worth,
 * because the balance helper debits the source and never credits anyone.
 *
 * So the schemas live here, in `src/lib`, and are imported by both sides. The
 * client schemas for these remain separate: a form wants a *string* for an
 * amount being typed, and this wants the parsed number that arrives over the
 * wire. Same rule, two representations.
 */

/** Nullable string where the empty string means "no value". */
const optionalText = z
  .string()
  .transform((s) => (s === "" || s === null || s === undefined ? null : s))
  .nullable();

export const splitInputSchema = z.object({
  amountMinor: z.number().int().min(0),
  categoryId: optionalText,
  payeeId: optionalText,
  description: optionalText,
});

export const transactionInputSchema = z
  .object({
    date: z.date(),
    type: z.enum(TRANSACTION_TYPES),
    accountId: z.string().min(1, "La cuenta es obligatoria"),
    destinationAccountId: optionalText,
    amountMinor: z.number().int().min(0),
    currency: z.enum(CURRENCIES),
    destinationAmountMinor: z.number().int().min(0).nullable(),
    destinationCurrency: z.enum(CURRENCIES).nullable(),
    categoryId: optionalText,
    payeeId: optionalText,
    description: optionalText,
    projectTrip: optionalText,
    notes: optionalText,
  })
  .superRefine((tx, ctx) => {
    // A transfer moves money from one account to another. With no destination,
    // `movementFor` debits the source and matches no destination row, so the
    // money leaves the ledger and never arrives anywhere: the balance is wrong
    // with no transaction to show for it. Refuse to write that.
    if (tx.type === "transfer" && !tx.destinationAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationAccountId"],
        message: "Una transferencia necesita una cuenta destino",
      });
    }
    if (tx.destinationAccountId && tx.destinationAccountId === tx.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationAccountId"],
        message: "La cuenta destino debe ser distinta de la cuenta origen",
      });
    }
    if (tx.type !== "transfer" && tx.destinationAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationAccountId"],
        message: "Solo las transferencias tienen cuenta destino",
      });
    }
  });

export const bulkTransactionPatchSchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional(),
  accountId: z.string().min(1).optional(),
  destinationAccountId: optionalText.optional(),
  categoryId: optionalText.optional(),
  payeeId: optionalText.optional(),
  projectTrip: optionalText.optional(),
  notes: optionalText.optional(),
});

export type ValidatedTransaction = z.infer<typeof transactionInputSchema>;
export type ValidatedSplit = z.infer<typeof splitInputSchema>;
export type ValidatedBulkPatch = z.infer<typeof bulkTransactionPatchSchema>;

/** Turns a ZodError into one Spanish sentence, not a stack trace. */
export function formatIssues(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Datos inválidos";
  const path = first.path.join(" → ");
  return path ? `${first.message} (${path})` : first.message;
}

/** Throws a user-readable error if the input doesn't satisfy the schema. */
export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(formatIssues(result.error));
  return result.data;
}

/**
 * The invariant that bulk editing cannot express in a patch: whether each row
 * is *allowed* to end up as a destinationless transfer depends on the row's own
 * type, which the patch doesn't know. Returns the ids that would end up
 * invalid, so the caller can refuse instead of writing them.
 */
export function findInvalidTransfers(
  // `notes` (and any other non-transfer field) is accepted and ignored: the
  // question here is only whether the transfer invariant holds.
  patch: {
    type?: string;
    accountId?: string;
    destinationAccountId?: string | null;
    [key: string]: unknown;
  },
  rows: { id: number; type: string; accountId: string; destinationAccountId: string | null }[]
): number[] {
  const bad: number[] = [];
  for (const row of rows) {
    const nextType = patch.type ?? row.type;
    const nextDest = patch.destinationAccountId === undefined ? row.destinationAccountId : patch.destinationAccountId;
    if (nextType === "transfer" && !nextDest) bad.push(row.id);
    if (nextType !== "transfer" && nextDest) bad.push(row.id);
    if (nextDest && nextDest === (patch.accountId ?? row.accountId)) bad.push(row.id);
  }
  return bad;
}

/**
 * The input of the duplicate check (ROADMAP §2.5).
 *
 * Validated like every other action input, for the same reason: a server action
 * is an endpoint that accepts whatever JSON it is posted, and this one reaches a
 * `WHERE` clause. A malformed date here would otherwise become an invalid Date
 * and a range that matches nothing — which reads as "no duplicates", the one
 * answer that must never be wrong in the direction of silence.
 */
export const duplicateCheckSchema = z.object({
  id: z.number().int().positive().optional(),
  date: z.date(),
  amountMinor: z.number().finite(),
  currency: z.enum(CURRENCIES),
  payeeId: optionalText,
  description: optionalText,
});

/**
 * Splits that attribute more money than the transaction being split.
 *
 * A split is supposed to *move* an amount between categories, never create it —
 * that invariant is what `splits.test.ts` exists to protect. Nothing enforced
 * it at the boundary, though: each split was only checked for being a
 * non-negative number, so a 100.000 withdrawal could be split into 150.000 of
 * "mercado" plus 80.000 of "carnes". Both splits are counted in full by
 * `categoryAllocations` while the negative remainder is dropped, so every total
 * downstream — categories, budget, statistics — ends up with 230.000 of spending
 * from a 100.000 movement. Invented money, silently.
 *
 * Returns the excess so the caller can put a number in the error message; the
 * per-split paths are reported too because "the splits add up wrong" is easier
 * to act on than "split 2 is invalid".
 */
export function findOversplit(splits: { amountMinor: number }[], parentAmountMinor: number) {
  const splitTotal = splits.reduce((s, split) => s + split.amountMinor, 0);
  const excessMinor = splitTotal - parentAmountMinor;
  if (excessMinor <= 0) return null;
  return { splitTotal, excessMinor };
}

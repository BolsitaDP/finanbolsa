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

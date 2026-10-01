import { describe, expect, it } from "vitest";

import {
  bulkTransactionPatchSchema,
  findInvalidTransfers,
  findOversplit,
  formatIssues,
  parseOrThrow,
  transactionInputSchema,
} from "@/lib/schemas";

/**
 * This module is the only thing standing between a malformed request and a
 * corrupt ledger. The specific case it exists for: a `transfer` with no
 * destination account. `movementFor` in balance.ts debits the source and only
 * credits a destination that matches — so such a row moves money out of the
 * world with no visible transaction explaining why. The balance is then wrong
 * and nothing on screen points at the cause.
 */

const validTx = {
  date: new Date("2026-01-15T12:00:00Z"),
  type: "expense" as const,
  accountId: "acc-1",
  destinationAccountId: null,
  amountMinor: 22_500,
  currency: "COP" as const,
  destinationAmountMinor: null,
  destinationCurrency: null,
  categoryId: "cat-1",
  payeeId: null,
  description: "Rappi",
  projectTrip: null,
  notes: null,
};

describe("transactionInputSchema", () => {
  it("accepts an ordinary expense", () => {
    expect(parseOrThrow(transactionInputSchema, validTx)).toMatchObject({
      type: "expense",
      amountMinor: 22_500,
    });
  });

  it("rejects a transfer with no destination account", () => {
    const result = transactionInputSchema.safeParse({
      ...validTx,
      type: "transfer",
      destinationAccountId: null,
    });
    expect(result.success).toBe(false);
    expect(formatIssues(result.error!)).toContain("cuenta destino");
  });

  it("rejects a transfer whose destination equals its source", () => {
    const result = transactionInputSchema.safeParse({
      ...validTx,
      type: "transfer",
      destinationAccountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a transfer with two distinct accounts", () => {
    expect(
      transactionInputSchema.safeParse({
        ...validTx,
        type: "transfer",
        destinationAccountId: "acc-2",
      }).success
    ).toBe(true);
  });

  it("rejects a destination on a non-transfer", () => {
    // Harmless to the balance, but it means the row is lying about itself.
    const result = transactionInputSchema.safeParse({
      ...validTx,
      type: "expense",
      destinationAccountId: "acc-2",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown type outright", () => {
    // The type was previously a compile-time union only, so a server action
    // would have accepted "banana" and written it to the database.
    const result = transactionInputSchema.safeParse({ ...validTx, type: "banana" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown currency", () => {
    expect(transactionInputSchema.safeParse({ ...validTx, currency: "BTC" }).success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(transactionInputSchema.safeParse({ ...validTx, amountMinor: -1 }).success).toBe(false);
  });

  it("rejects a non-integer amount", () => {
    expect(transactionInputSchema.safeParse({ ...validTx, amountMinor: 22_500.5 }).success).toBe(false);
  });

  it("requires an account", () => {
    expect(transactionInputSchema.safeParse({ ...validTx, accountId: "" }).success).toBe(false);
  });

  it("normalises empty strings to null", () => {
    // The form submits "" for "no value"; the column wants NULL.
    const parsed = parseOrThrow(transactionInputSchema, {
      ...validTx,
      description: "",
      categoryId: "",
      notes: "",
    });
    expect(parsed.description).toBeNull();
    expect(parsed.categoryId).toBeNull();
    expect(parsed.notes).toBeNull();
  });
});

describe("bulkTransactionPatchSchema", () => {
  it("accepts an empty patch", () => {
    expect(bulkTransactionPatchSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown type in the patch", () => {
    expect(bulkTransactionPatchSchema.safeParse({ type: "banana" }).success).toBe(false);
  });

  it("keeps only the fields that were provided", () => {
    const parsed = parseOrThrow(bulkTransactionPatchSchema, { categoryId: "cat-2" });
    expect(Object.keys(parsed)).toEqual(["categoryId"]);
  });
});

describe("findInvalidTransfers", () => {
  const row = (over = {}) => ({
    id: 1,
    type: "expense",
    accountId: "acc-1",
    destinationAccountId: null,
    ...over,
  });

  it("flags a row that would become a destinationless transfer", () => {
    const bad = findInvalidTransfers({ type: "transfer" }, [row()]);
    expect(bad).toEqual([1]);
  });

  it("accepts a transfer when the patch supplies a destination", () => {
    expect(
      findInvalidTransfers({ type: "transfer", destinationAccountId: "acc-2" }, [row()])
    ).toEqual([]);
  });

  it("accepts rows that were already valid transfers and stay valid", () => {
    const rows = [row({ id: 1, type: "transfer", destinationAccountId: "acc-2" })];
    expect(findInvalidTransfers({ notes: "x" }, rows)).toEqual([]);
  });

  it("flags setting a destination on a non-transfer", () => {
    expect(findInvalidTransfers({ destinationAccountId: "acc-2" }, [row()])).toEqual([1]);
  });

  it("flags a destination that collides with the patched source account", () => {
    expect(
      findInvalidTransfers(
        { type: "transfer", destinationAccountId: "acc-2", accountId: "acc-2" },
        [row()]
      )
    ).toEqual([1]);
  });

  it("judges each row against its own state, not the patch alone", () => {
    // Two rows, one already a valid transfer and one an expense. The patch
    // adds a note to both; only the expense is fine, and the transfer keeps
    // its own destination because the patch didn't touch it.
    const rows = [
      row({ id: 1, type: "transfer", destinationAccountId: "acc-2" }),
      row({ id: 2, type: "expense" }),
    ];
    expect(findInvalidTransfers({ notes: "revisar" }, rows)).toEqual([]);
  });

  it("reports every offending id, not just the first", () => {
    const rows = [row({ id: 1 }), row({ id: 2 }), row({ id: 3 })];
    expect(findInvalidTransfers({ type: "transfer" }, rows)).toEqual([1, 2, 3]);
  });
});

describe("findOversplit", () => {
  const split = (amountMinor: number) => ({ amountMinor });

  it("reports the excess when the breakdown claims more than the transaction", () => {
    // El bug: 150.000 + 80.000 sobre un retiro de 100.000. Cada split se cuenta
    // completo y el remanente negativo se descarta, así que las categorías
    // acababan reclamando 230.000 de un movimiento de 100.000.
    expect(findOversplit([split(150_000), split(80_000)], 100_000)).toEqual({
      splitTotal: 230_000,
      excessMinor: 130_000,
    });
  });

  it("stays quiet on a breakdown that fits exactly", () => {
    // El borde legítimo: un desglose completo sin remanente es el caso normal de
    // un retiro de efectivo del que uno se acuerda por partes.
    expect(findOversplit([split(60_000), split(40_000)], 100_000)).toBeNull();
  });

  it("stays quiet on a partial breakdown, which leaves a remainder by design", () => {
    expect(findOversplit([split(30_000)], 100_000)).toBeNull();
  });

  it("stays quiet with no splits at all", () => {
    expect(findOversplit([], 100_000)).toBeNull();
  });

  it("is decided by a single peso, not by a tolerance", () => {
    // No hay margen: atribuir un peso de más ya es un peso de más. Un redondeo
    // "razonable" aquí escondería exactamente el caso que la función existe para
    // encontrar.
    expect(findOversplit([split(100_001)], 100_000)).toEqual({
      splitTotal: 100_001,
      excessMinor: 1,
    });
  });
});

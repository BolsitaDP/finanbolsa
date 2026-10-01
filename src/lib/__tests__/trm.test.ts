import { describe, expect, it } from "vitest";

import { TRM_CURRENCIES } from "@/lib/trm";

/**
 * The TRM fetcher is the reason the owner never has to type a rate by hand, so
 * the parts that can be checked without a network call are pinned here. The
 * live call itself is exercised manually — it depends on an external open-data
 * endpoint that is not a test fixture.
 */

describe("TRM_CURRENCIES", () => {
  it("lists only the currencies the TRM dataset quotes against COP", () => {
    // COP itself is the base, not a pair. Anything outside this list has no
    // published TRM and has to be entered by hand.
    expect([...TRM_CURRENCIES]).toEqual(["USD", "EUR", "GBP", "CHF"]);
  });

  it("does not include the base currency", () => {
    const list: readonly string[] = TRM_CURRENCIES;
    expect(list).not.toContain("COP");
  });
});

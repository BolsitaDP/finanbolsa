import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  COOKIE_NAME,
  createSessionToken,
  passwordMatches,
  readSessionCookie,
  verifySessionToken,
} from "@/lib/auth";

/**
 * Auth is the only thing standing between a device on the LAN and a database
 * that can be wiped from a browser. These tests pin the properties the proxy
 * and the destructive Server Actions rely on.
 */

const SECRET = "a".repeat(64);
const PASSWORD = "correct horse battery staple";

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  process.env.AUTH_PASSWORD = PASSWORD;
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_PASSWORD;
});

describe("passwordMatches", () => {
  it("accepts the configured password and rejects anything else", () => {
    expect(passwordMatches(PASSWORD)).toBe(true);
    expect(passwordMatches("wrong")).toBe(false);
    expect(passwordMatches("")).toBe(false);
  });

  it("is case sensitive", () => {
    expect(passwordMatches(PASSWORD.toUpperCase())).toBe(false);
  });

  it("denies access when AUTH_PASSWORD is unset rather than throwing", () => {
    // A missing env var must fail closed. Throwing here would turn every login
    // attempt into a 500 and bury the real problem (unset variable) in a
    // stack trace.
    delete process.env.AUTH_PASSWORD;
    expect(passwordMatches("")).toBe(false);
    expect(passwordMatches(PASSWORD)).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips a freshly created token", () => {
    expect(verifySessionToken(createSessionToken())).toBe(true);
  });

  it("rejects a token whose payload was edited to extend its expiry", () => {
    const token = createSessionToken();
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 10 * 365 * 24 * 3600_000 }))
      .toString("base64url");

    expect(verifySessionToken(`${forged}.${signature}`)).toBe(false);
    expect(verifySessionToken(`${payload}.${signature}`)).toBe(true);
  });

  it("rejects a token signed with a different secret", () => {
    // Rotating AUTH_SECRET has to invalidate every existing session, or
    // revoking access would silently fail.
    const token = createSessionToken();
    process.env.AUTH_SECRET = "b".repeat(64);

    expect(verifySessionToken(token)).toBe(false);
  });

  it("rejects an expired token", () => {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const justExpired = createSessionToken(Date.now() - thirtyDays - 1_000);

    expect(verifySessionToken(justExpired)).toBe(false);
  });

  it("accepts a token that has not expired yet", () => {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const almostExpired = createSessionToken(Date.now() - thirtyDays + 60_000);

    expect(verifySessionToken(almostExpired)).toBe(true);
  });

  it("rejects malformed, empty and partial input without throwing", () => {
    for (const bad of [undefined, "", ".", "no-dot", "a.b", "....", "x".repeat(500)]) {
      expect(verifySessionToken(bad)).toBe(false);
    }
  });

  it("rejects a token whose payload is not valid JSON", () => {
    const payload = Buffer.from("not json").toString("base64url");
    // Signature won't match anyway; the point is that it returns false rather
    // than throwing out of the proxy.
    expect(verifySessionToken(`${payload}.whatever`)).toBe(false);
  });

  it("rejects a payload with no exp field", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "owner" })).toString("base64url");
    const token = createSessionToken();
    const signature = token.split(".")[1];

    expect(verifySessionToken(`${payload}.${signature}`)).toBe(false);
  });
});

describe("readSessionCookie", () => {
  it("finds the session cookie among others", () => {
    const header = `theme=dark; ${COOKIE_NAME}=abc123; locale=es`;

    expect(readSessionCookie(header)).toBe("abc123");
  });

  it("does not match a cookie whose name merely ends with the session name", () => {
    expect(readSessionCookie(`not_${COOKIE_NAME}=abc123`)).toBeUndefined();
  });

  it("returns undefined when the header is empty or malformed", () => {
    expect(readSessionCookie("")).toBeUndefined();
    expect(readSessionCookie("novalue")).toBeUndefined();
  });
});

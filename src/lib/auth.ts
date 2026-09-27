import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Single-user auth for a self-hosted personal-finance app: one password from
 * the environment, exchanged for a signed session cookie.
 *
 * Deliberately not a user store or a session table. There is exactly one
 * owner, so identity resolution would be a table with one permanent row — all
 * cost, no benefit. What the app does need is that a request arriving on the
 * LAN can't read or delete anything without the password.
 */

const COOKIE_NAME = "finanbolsa_session";
// 30 days. Long enough that a home server doesn't log you out every few days,
// short enough that a stolen cookie has a bounded lifetime — rotateable by
// restarting with a new AUTH_SECRET.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export { COOKIE_NAME };

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    // Thrown lazily rather than at import time so the app still boots (and can
    // serve /login, and log a readable error) when the env var is missing.
    throw new Error(
      "AUTH_SECRET no está definido. Genera uno con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return value;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Constant-time string compare that doesn't leak length via early return. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so pad to a common length first.
  // Comparing the padded buffers still costs the same regardless of content.
  const len = Math.max(bufA.length, bufB.length, 32);
  const paddedA = Buffer.alloc(len);
  const paddedB = Buffer.alloc(len);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  return timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
}

/**
 * Verifies a password against AUTH_PASSWORD. Returns false (never throws) when
 * auth isn't configured, so a missing env var denies access rather than
 * producing a 500 on every login attempt.
 */
export function passwordMatches(candidate: string): boolean {
  const expected = process.env.AUTH_PASSWORD;
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

export function createSessionToken(now = Date.now()): string {
  const payload = base64url(JSON.stringify({ exp: now + SESSION_TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

/** Returns true only for a well-formed, correctly-signed, unexpired token. */
export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    return typeof exp === "number" && exp > now;
  } catch {
    return false;
  }
}

/**
 * Guard for destructive Server Actions — see `assertAuthenticated` in
 * auth-session.ts, which needs `next/headers` and therefore lives in its own
 * module (this one stays free of Next imports so the proxy and the tests can
 * use it directly).
 *
 * Reads the session cookie off a plain Request. Kept dependency-free so it can
 * be called from the proxy, from a route handler, and from tests alike.
 */
export function isAuthenticatedRequest(request: Request): boolean {
  return verifySessionToken(readSessionCookie(request.headers.get("cookie") ?? ""));
}

export function readSessionCookie(cookieHeader: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === COOKIE_NAME) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    // Only mark Secure when actually served over HTTPS. On a LAN deployment
    // over plain http, a Secure cookie is silently dropped by the browser and
    // the user can never log in.
    secure: process.env.NODE_ENV === "production" && process.env.FINANBOLSA_HTTPS === "true",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  } as const;
}

/** For generating a secret: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" */
export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

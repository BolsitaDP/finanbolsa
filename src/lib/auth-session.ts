import { cookies } from "next/headers";

import { isAuthenticatedRequest, verifySessionToken, readSessionCookie } from "./auth";

/**
 * Request-scope auth helpers that need `next/headers`.
 *
 * Split out of auth.ts so that module stays free of Next.js imports and can be
 * loaded by the proxy and by unit tests, which have no request scope.
 */

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(readSessionCookie(store.toString()));
}

/**
 * Guard for destructive Server Actions.
 *
 * The proxy already blocks unauthenticated requests, but Next's docs warn that
 * a matcher edit can silently drop coverage for a route, and Server Actions
 * are POSTs to the page route they live on — so a bad matcher leaves the app
 * open with no error anywhere. Checking again inside the action that can wipe
 * the database means that failure mode needs two independent bugs to line up.
 */
export async function assertAuthenticated(): Promise<void> {
  if (!(await isAuthenticated())) {
    throw new Error("No autenticado.");
  }
}

export { isAuthenticatedRequest };

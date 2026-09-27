import { NextResponse, type NextRequest } from "next/server";

import { isAuthenticatedRequest } from "@/lib/auth";

/**
 * Authentication gate for every page and API route.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts`; the old convention is
 * deprecated. Proxy runs on the Node.js runtime by default as of v16.
 */
export function proxy(request: NextRequest) {
  if (isAuthenticatedRequest(request)) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // An unauthenticated API caller can't be handed a login page — it wants a
  // status code it can act on. Redirecting would produce a 200 with HTML
  // where the caller expected data.
  if (pathname.startsWith("/api/")) {
    return Response.json(
      { error: "No autenticado" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const loginUrl = new URL("/login", request.url);
  // Preserve the destination so login can bounce back there.
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the login page itself. Deliberately
     * broad: a matcher that enumerates protected paths is a matcher that
     * eventually forgets one — and forgetting `/login` here would spin the
     * browser in a redirect loop, so that exclusion is load-bearing.
     * `_next/data` is excluded from the pattern but still invokes the proxy on
     * purpose, so a data route can't be reached by dodging the pattern.
     */
    "/((?!_next/static|_next/image|favicon.ico|login).*)",
  ],
};

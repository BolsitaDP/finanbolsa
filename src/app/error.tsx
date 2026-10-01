"use client";

import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Algo salió mal — FinanBolsa",
};

/**
 * App-level error boundary.
 *
 * Until now a failed Server Action or a database error produced a blank white
 * page with the message only in the browser console — useless on a self-hosted
 * app on a phone, where the console is not visible. This at least says what
 * happened and offers a way out.
 *
 * The recovery hint matters more than it looks: a failed action leaves the
 * page rendering from stale server data, so a plain refresh is often enough.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <AlertTriangleIcon className="size-10 text-destructive" />
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Algo salió mal</h1>
          <p className="text-sm text-muted-foreground">
            La página no pudo terminar de cargar. Tus datos no se modificaron.
          </p>
        </div>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground">Referencia: {error.digest}</p>
        ) : null}
        <div className="flex gap-2">
          <Button onClick={reset}>Reintentar</Button>
          <Button variant="outline" render={<Link href="/">
            <RotateCcwIcon /> Ir al inicio
          </Link>} />
        </div>
        {process.env.NODE_ENV === "development" ? (
          <pre className="mt-2 max-w-full overflow-x-auto rounded-md bg-muted p-3 text-left text-xs">
            {error.message}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

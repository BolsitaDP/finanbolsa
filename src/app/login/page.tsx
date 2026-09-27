import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { isAuthenticated } from "@/lib/auth-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// The proxy excludes /login from its matcher (it has to, or the browser would
// loop on redirects), so an already-authenticated user landing here is checked
// here instead — otherwise a stale bookmark shows a login form for a session
// that already works.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await isAuthenticated()) redirect("/");

  const { next } = await searchParams;
  const authConfigured = Boolean(process.env.AUTH_PASSWORD);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>FinanBolsa</CardTitle>
          <CardDescription>
            {authConfigured
              ? "Introduce tu contraseña para continuar."
              : "Autenticación no configurada: define AUTH_PASSWORD y AUTH_SECRET para habilitar el acceso."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </div>
  );
}

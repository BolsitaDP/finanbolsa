import { Suspense } from "react";
import { and, count, isNull } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { AppSidebar } from "@/components/app-sidebar";
import { GlobalSearch } from "@/components/global-search";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

function SidebarSkeleton() {
  return <div className="hidden w-64 shrink-0 border-r md:block" />;
}

/**
 * Authenticated chrome. Everything inside this route group is behind
 * `src/proxy.ts`, which redirects unauthenticated requests to /login.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // How many transactions are waiting to be categorised. Shown in the sidebar
  // so the weekly chore is visible from any page, not just the table.
  const [{ value: uncategorizedCount }] = await db
    .select({ value: count() })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), isNull(transactions.categoryId)));

  return (
    <TooltipProvider>
      <SidebarProvider>
        {/* AppSidebar reads ?category to highlight the "Sin categorizar"
            entry, and useSearchParams forces a client bailout — which needs a
            Suspense boundary to prerender. */}
        <Suspense fallback={<SidebarSkeleton />}>
          <AppSidebar uncategorizedCount={uncategorizedCount} />
        </Suspense>
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm font-medium">FinanBolsa</span>
            <div className="ml-auto">
              <GlobalSearch />
            </div>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Landmark,
  ArrowLeftRight,
  Tags,
  Settings,
  Users,
  Wand2,
  Wallet,
  Upload,
  Repeat,
  Briefcase,
  ListChecks as ListChecksIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Presupuesto", url: "/presupuesto", icon: Wallet },
  { title: "Cuentas", url: "/cuentas", icon: Landmark },
  { title: "Transacciones", url: "/transacciones", icon: ArrowLeftRight },
  { title: "Recurrentes", url: "/recurrentes", icon: Repeat },
  { title: "Importar", url: "/importar", icon: Upload },
  { title: "Categorías", url: "/categorias", icon: Tags },
  { title: "Payees", url: "/payees", icon: Users },
  { title: "Proyectos / Viajes", url: "/proyectos", icon: Briefcase },
  { title: "Reglas", url: "/reglas", icon: Wand2 },
  { title: "Configuración", url: "/configuracion", icon: Settings },
];

export function AppSidebar({ uncategorizedCount = 0 }: { uncategorizedCount?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // "Sin categoría" is a view, not a filter to go hunting for: the weekly
  // chore is clearing the uncategorised backlog, and the only way to reach it
  // used to be scanning the table for em-dashes.
  const itemsWithBadge = items.map((item) =>
    item.url === "/transacciones" && uncategorizedCount > 0
      ? { ...item, badge: uncategorizedCount }
      : item
  );

  const hasBacklog = uncategorizedCount > 0;

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1.5 text-sm font-semibold">FinanBolsa</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* The weekly chore made reachable: everything that arrived
                  without a category, in one click. The count next to
                  "Transacciones" says there is a backlog; this is the place to
                  clear it. */}
              {hasBacklog ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname === "/transacciones" && searchParams.get("category") === "none"}
                    render={<Link href="/transacciones?category=none" />}
                  >
                    <ListChecksIcon />
                    <span className="flex-1">Sin categorizar</span>
                    <span className="rounded-full bg-destructive/15 px-1.5 text-xs font-medium text-destructive tabular-nums">
                      {uncategorizedCount}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
              {itemsWithBadge.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    isActive={pathname === item.url}
                    render={<Link href={item.url} />}
                  >
                    <item.icon />
                    <span className="flex-1">{item.title}</span>
            {"badge" in item && item.badge ? (
              <span className="rounded-full bg-destructive/15 px-1.5 text-xs font-medium text-destructive tabular-nums">
                {item.badge}
              </span>
            ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

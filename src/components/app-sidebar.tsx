"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function AppSidebar() {
  const pathname = usePathname();

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
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    isActive={pathname === item.url}
                    render={<Link href={item.url} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
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

import {
  LayoutDashboard,
  Receipt,
  Ship,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** shown in bottom bar (primary) vs "More" sheet */
  primary?: boolean;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard, primary: true },
  { href: "/gastos", label: "Gastos", icon: Receipt, primary: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3, primary: true },
  { href: "/barcos", label: "Barcos", icon: Ship, adminOnly: true },
  { href: "/configuracion", label: "Configuración", icon: Settings, adminOnly: true },
];

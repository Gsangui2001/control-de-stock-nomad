import {
  LayoutDashboard,
  ChefHat,
  Wine,
  Package,
  ShoppingCart,
  BookOpen,
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
  { href: "/preparar", label: "Preparar", icon: ChefHat, primary: true },
  { href: "/bebidas", label: "Bebidas", icon: Wine, primary: true },
  { href: "/stock", label: "Stock", icon: Package, primary: true },
  { href: "/compras", label: "Compras", icon: ShoppingCart },
  { href: "/platos", label: "Platos / Recetas", icon: BookOpen },
  { href: "/charters", label: "Charters", icon: Ship },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

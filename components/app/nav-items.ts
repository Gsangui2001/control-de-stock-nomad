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
  { href: "/charters", label: "Charters", icon: Ship },
  { href: "/compras", label: "Compras", icon: ShoppingCart, adminOnly: true },
  { href: "/platos", label: "Platos / Recetas", icon: BookOpen, adminOnly: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3, adminOnly: true },
  { href: "/configuracion", label: "Configuración", icon: Settings, adminOnly: true },
];

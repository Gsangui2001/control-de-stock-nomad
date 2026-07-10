"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Wallet,
  AlertCircle,
  Wine,
  ChefHat,
  ShoppingCart,
  Ship,
  Utensils,
  SlidersHorizontal,
  TrendingDown,
  Package,
} from "lucide-react";
import { useProducts, useAlerts, usePreparedDishes, useMovements, usePurchases } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { totalStockValue, stockStatus, isToday } from "@/lib/domain/stock";
import { canManage } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";
import { PageContainer, DemoBanner } from "@/components/app/common";
import { StatCard } from "@/components/app/StatCard";
import { AlertList } from "@/components/app/AlertList";
import { CookHome } from "@/components/app/CookHome";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const QUICK = [
  { href: "/preparar", label: "Preparar", icon: Utensils, variant: "success" as const },
  { href: "/bebidas", label: "Bebida", icon: Wine, variant: "default" as const },
  { href: "/compras", label: "Compra", icon: ShoppingCart, variant: "secondary" as const },
  { href: "/stock", label: "Ajustar", icon: SlidersHorizontal, variant: "outline" as const },
];

export default function DashboardPage() {
  const { user, settings, activeCharter } = useRepoContext();

  // Cocinero / solo-lectura ven un home minimalista y accionable.
  if (!canManage(user?.role)) {
    return <CookHome />;
  }
  return <AdminDashboard />;
}

function AdminDashboard() {
  const { user, settings, activeCharter } = useRepoContext();
  const { data: products } = useProducts();
  const { data: alerts } = useAlerts();
  const { data: prepared } = usePreparedDishes();
  const { data: movements } = useMovements();
  const { data: purchases } = usePurchases();

  const totalValue = useMemo(() => totalStockValue(products), [products]);
  const criticalIng = products.filter((p) => p.category !== "bebidas" && stockStatus(p) !== "normal").length;
  const criticalBev = products.filter((p) => p.category === "bebidas" && stockStatus(p) !== "normal").length;

  const preparedToday = prepared.filter((p) => isToday(p.preparedAt));
  const servingsToday = preparedToday.reduce((s, p) => s + p.servings, 0);

  const consumptionToday = useMemo(() => {
    const consumed = movements.filter(
      (m) => isToday(m.createdAt) && (m.movementType === "preparacion" || m.movementType === "consumo_bebida")
    );
    return consumed.reduce((s, m) => s + m.costAmount, 0);
  }, [movements]);

  const bevConsumedToday = movements
    .filter((m) => isToday(m.createdAt) && m.movementType === "consumo_bebida")
    .reduce((s, m) => s + Math.abs(m.quantity), 0);

  const lastPurchase = purchases[0];

  return (
    <PageContainer>
      <DemoBanner />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Hola{user ? `, ${user.name.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          {activeCharter ? (
            <span className="inline-flex items-center gap-1">
              <Ship className="h-3.5 w-3.5" /> Charter activo: <strong>{activeCharter.code}</strong>
            </span>
          ) : (
            "Sin charter activo"
          )}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <Button
              key={q.href}
              asChild
              variant={q.variant}
              className="h-14 justify-start gap-2 text-base"
            >
              <Link href={q.href}>
                <Icon className="h-5 w-5 shrink-0" />
                {q.label}
              </Link>
            </Button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Valor del stock" value={formatMoney(totalValue, settings.currency)} icon={Wallet} href="/stock" />
        <StatCard
          label="Consumo de hoy"
          value={formatMoney(consumptionToday, settings.currency)}
          sub={`${bevConsumedToday} bebidas`}
          icon={TrendingDown}
          tone="warning"
        />
        <StatCard
          label="Ingredientes críticos"
          value={criticalIng}
          icon={AlertCircle}
          href="/stock"
          tone={criticalIng > 0 ? "critical" : "success"}
        />
        <StatCard
          label="Bebidas bajas"
          value={criticalBev}
          icon={Wine}
          href="/bebidas"
          tone={criticalBev > 0 ? "warning" : "success"}
        />
        <StatCard label="Platos hoy" value={servingsToday} sub={`${preparedToday.length} preparaciones`} icon={ChefHat} href="/preparar" tone="success" />
        <StatCard
          label="Última compra"
          value={lastPurchase ? formatMoney(lastPurchase.totalAmount, settings.currency) : "—"}
          sub={lastPurchase ? format(new Date(lastPurchase.date), "dd MMM", { locale: es }) : "sin compras"}
          icon={ShoppingCart}
          href="/compras"
        />
      </div>

      {/* Alerts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Alertas</h2>
          {alerts.length > 4 && (
            <Link href="/reportes" className="text-xs text-primary font-medium">
              Ver todas ({alerts.length})
            </Link>
          )}
        </div>
        <AlertList alerts={alerts} limit={4} />
      </div>
    </PageContainer>
  );
}

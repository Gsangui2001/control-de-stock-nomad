"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Wine,
  ChefHat,
  ShoppingCart,
  Ship,
  Utensils,
  SlidersHorizontal,
  ClipboardList,
} from "lucide-react";
import {
  useProducts,
  useAlerts,
  usePreparedDishes,
  useMovements,
  usePurchases,
  useRecipes,
  useMealPlans,
} from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { totalStockValue, stockStatus, isToday } from "@/lib/domain/stock";
import { computePlanNeeds, computeShortages } from "@/lib/domain/planning";
import { canManage } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";
import { PageContainer, DemoBanner } from "@/components/app/common";
import { StatCard } from "@/components/app/StatCard";
import { AlertList } from "@/components/app/AlertList";
import { CookHome } from "@/components/app/CookHome";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const QUICK = [
  { href: "/preparar", label: "Preparar", icon: Utensils, tint: "bg-success/10 text-success" },
  { href: "/bebidas", label: "Bebida", icon: Wine, tint: "bg-accent/15 text-accent-foreground" },
  { href: "/compras", label: "Compra", icon: ShoppingCart, tint: "bg-secondary text-secondary-foreground" },
  { href: "/stock", label: "Ajustar", icon: SlidersHorizontal, tint: "bg-primary/10 text-primary" },
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
  const { data: recipes } = useRecipes();
  const { data: mealPlans } = useMealPlans(
    activeCharter ? { charterId: activeCharter.id } : undefined
  );

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

  const lastPurchase = purchases[0];

  const suggestedPurchases = useMemo(() => {
    const planned = mealPlans.filter((m) => m.status === "planificado");
    const needs = computePlanNeeds(planned, recipes, products);
    return computeShortages(needs, products).length;
  }, [mealPlans, recipes, products]);

  const charterConsumption = useMemo(() => {
    if (!activeCharter) return 0;
    const charterMovs = movements.filter((m) => m.charterId === activeCharter.id);
    return charterMovs
      .filter((m) => m.movementType === "preparacion" || m.movementType === "consumo_bebida")
      .reduce((s, m) => s + m.costAmount, 0);
  }, [movements, activeCharter]);

  return (
    <PageContainer>
      <DemoBanner />

      <div>
        <h1 className="text-[26px] font-bold tracking-tight">
          Hola{user ? `, ${user.name.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5 first-letter:uppercase">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Hero: valor del stock + consumo, en una sola card protagonista */}
      <Link href="/reportes" className="block">
        <div className="rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/85 text-primary-foreground p-5 shadow-lifted transition-transform active:scale-[0.99]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-80">
              Valor del stock
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium">
              <Ship className="h-3.5 w-3.5" />
              {activeCharter ? activeCharter.code : "Sin charter"}
            </span>
          </div>
          <div className="text-4xl font-bold tabular-nums mt-2">
            {formatMoney(totalValue, settings.currency)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3.5">
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-70">Consumo hoy</div>
              <div className="text-lg font-semibold tabular-nums">
                {formatMoney(consumptionToday, settings.currency)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-70">Consumo del charter</div>
              <div className="text-lg font-semibold tabular-nums">
                {activeCharter ? formatMoney(charterConsumption, settings.currency) : "—"}
              </div>
            </div>
          </div>
        </div>
      </Link>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2.5">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <Link
              key={q.href}
              href={q.href}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card py-3.5 shadow-soft transition-all hover:shadow-lifted active:scale-95"
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${q.tint}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold">{q.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
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
        <StatCard
          label="Platos hoy"
          value={servingsToday}
          sub={`${preparedToday.length} preparaciones`}
          icon={ChefHat}
          href="/preparar"
          tone="success"
        />
        <StatCard
          label="Última compra"
          value={lastPurchase ? formatMoney(lastPurchase.totalAmount, settings.currency) : "—"}
          sub={lastPurchase ? format(new Date(lastPurchase.date), "dd MMM", { locale: es }) : "sin compras"}
          icon={ShoppingCart}
          href="/compras"
        />
        <div className="col-span-2">
          <StatCard
            label="Compras sugeridas"
            value={suggestedPurchases}
            sub="ingredientes faltantes según lo planificado"
            icon={ClipboardList}
            href="/planificacion"
            tone={suggestedPurchases > 0 ? "warning" : "success"}
          />
        </div>
      </div>

      {/* Alerts */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-base font-semibold">Alertas</h2>
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

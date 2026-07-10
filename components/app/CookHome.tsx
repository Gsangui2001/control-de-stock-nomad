"use client";

import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Utensils, Wine, Ship, PackageCheck, ChefHat, CalendarDays } from "lucide-react";
import { useProducts, usePreparedDishes, useMealPlans } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { stockStatus, isToday } from "@/lib/domain/stock";
import { mealSlotLabel, mealSlotIcon, mealItemCount } from "@/lib/domain/planning";
import { formatQty } from "@/lib/utils";
import { PageContainer, DemoBanner } from "@/components/app/common";
import { StockStatusBadge } from "@/components/app/StockStatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS_BADGE = {
  planificado: { label: "Planificado", variant: "info" as const },
  preparado: { label: "Preparado", variant: "success" as const },
  servida: { label: "Servida", variant: "accent" as const },
  cancelada: { label: "Cancelada", variant: "outline" as const },
};

/**
 * Home minimalista para cocinero / operario (y solo-lectura).
 * Sin plata ni números de gestión: dos acciones grandes + qué reponer.
 */
export function CookHome() {
  const { user, activeCharter } = useRepoContext();
  const { data: products } = useProducts();
  const { data: prepared } = usePreparedDishes();
  const { data: mealPlans } = useMealPlans(
    activeCharter ? { charterId: activeCharter.id } : undefined
  );

  const toReplenish = products
    .filter((p) => p.active && stockStatus(p) !== "normal")
    .sort((a, b) => (stockStatus(a) === "critico" ? -1 : 1))
    .slice(0, 8);

  const preparedToday = prepared.filter((p) => isToday(p.preparedAt));
  const servingsToday = preparedToday.reduce((s, p) => s + p.servings, 0);

  const todayISO = format(new Date(), "yyyy-MM-dd");
  const mealsToday = mealPlans
    .filter((m) => m.date === todayISO && mealItemCount(m) > 0)
    .sort((a, b) => a.slot.localeCompare(b.slot));

  return (
    <PageContainer>
      <DemoBanner />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">
            Hola{user ? `, ${user.name.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 first-letter:uppercase">
            {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
          </p>
        </div>
        <span className="mt-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
          <Ship className="h-3.5 w-3.5" />
          {activeCharter ? activeCharter.code : "Sin charter"}
        </span>
      </div>

      {/* Dos acciones grandes — el corazón del día del cocinero */}
      <div className="grid grid-cols-1 gap-3">
        <Button
          asChild
          variant="success"
          className="h-24 rounded-3xl text-lg justify-start gap-4 px-6 font-semibold shadow-lifted"
        >
          <Link href="/preparar">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <Utensils className="!h-7 !w-7" />
            </span>
            <span className="text-left">
              <span className="block">Preparar plato</span>
              <span className="block text-xs font-normal opacity-85">Elegí receta y porciones</span>
            </span>
          </Link>
        </Button>
        <Button
          asChild
          className="h-24 rounded-3xl text-lg justify-start gap-4 px-6 font-semibold shadow-lifted"
        >
          <Link href="/bebidas">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/12">
              <Wine className="!h-7 !w-7" />
            </span>
            <span className="text-left">
              <span className="block">Cargar bebida</span>
              <span className="block text-xs font-normal opacity-85">Registrar consumo</span>
            </span>
          </Link>
        </Button>
      </div>

      {/* Platos de hoy */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-success/10 text-success flex items-center justify-center shrink-0">
            <ChefHat className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Porciones preparadas hoy
            </div>
            <div className="text-3xl font-bold leading-none mt-1 tabular-nums">{servingsToday}</div>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            {preparedToday.length} preparación{preparedToday.length !== 1 ? "es" : ""}
          </div>
        </CardContent>
      </Card>

      {/* Comidas planificadas de hoy */}
      {mealsToday.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Comidas de hoy
          </h2>
          <div className="space-y-2.5">
            {mealsToday.map((m) => {
              const badge = STATUS_BADGE[m.status];
              return (
                <Link key={m.id} href="/planificacion" className="block">
                  <Card className="p-4 transition-all hover:shadow-lifted active:scale-[0.99]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
                          {mealSlotIcon(m.slot)}
                        </span>
                        <div className="min-w-0">
                          <span className="font-semibold block">{mealSlotLabel(m.slot)}</span>
                          <span className="text-xs text-muted-foreground">
                            {mealItemCount(m)} ítem{mealItemCount(m) !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <Badge variant={badge.variant} className="shrink-0">{badge.label}</Badge>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Para reponer */}
      <div>
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-primary" />
          Para reponer
        </h2>
        {toReplenish.length === 0 ? (
          <Card className="p-6 text-sm text-center">
            <div className="text-lg font-semibold mb-1">Todo bien 🎉</div>
            <div className="text-muted-foreground">Stock suficiente en todos los productos</div>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {toReplenish.map((p) => {
              const status = stockStatus(p);
              return (
                <Card
                  key={p.id}
                  className={`p-4 border-l-4 ${
                    status === "critico" ? "border-l-destructive" : "border-l-warning"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="font-semibold truncate">{p.name}</span>
                      <StockStatusBadge status={status} />
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xl font-bold tabular-nums">{formatQty(p.currentQuantity)}</span>{" "}
                      <span className="text-xs text-muted-foreground">{p.unit}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

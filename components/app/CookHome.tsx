"use client";

import Link from "next/link";
import { format } from "date-fns";
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
  planificado: { label: "Planificado", variant: "secondary" as const },
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

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Hola{user ? `, ${user.name.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          {activeCharter ? (
            <span className="inline-flex items-center gap-1">
              <Ship className="h-3.5 w-3.5" /> Charter <strong>{activeCharter.code}</strong>
            </span>
          ) : (
            "Sin charter activo"
          )}
        </p>
      </div>

      {/* Dos acciones grandes */}
      <div className="grid grid-cols-1 gap-3">
        <Button asChild size="lg" variant="success" className="h-24 text-lg justify-start gap-4 font-semibold shadow-sm hover:shadow-md transition-shadow">
          <Link href="/preparar">
            <Utensils className="h-7 w-7" />
            <div className="text-left">
              <div>Preparar plato</div>
              <div className="text-xs font-normal opacity-80">Seleccionar receta y porciones</div>
            </div>
          </Link>
        </Button>
        <Button asChild size="lg" className="h-24 text-lg justify-start gap-4 font-semibold shadow-sm hover:shadow-md transition-shadow">
          <Link href="/bebidas">
            <Wine className="h-7 w-7" />
            <div className="text-left">
              <div>Cargar bebida</div>
              <div className="text-xs font-normal opacity-80">Registrar consumo</div>
            </div>
          </Link>
        </Button>
      </div>

      {/* Platos de hoy */}
      <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-success/20 text-success flex items-center justify-center flex-shrink-0">
            <ChefHat className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-muted-foreground">Porciones preparadas</div>
            <div className="text-3xl font-bold leading-none mt-1">{servingsToday}</div>
            <div className="text-xs text-muted-foreground mt-1">{preparedToday.length} preparación{preparedToday.length !== 1 ? "es" : ""}</div>
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
          <div className="space-y-2">
            {mealsToday.map((m) => {
              const badge = STATUS_BADGE[m.status];
              return (
                <Link key={m.id} href="/planificacion">
                  <Card className="p-3 border-l-4 transition-all hover:shadow-sm" style={{borderLeftColor: "hsl(var(--primary))"}}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-2xl shrink-0">{mealSlotIcon(m.slot)}</span>
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
          <Card className="p-4 text-sm text-center bg-gradient-to-r from-success/10 to-success/5 border-success/20">
            <div className="text-lg font-semibold text-success mb-1">Todo bien 🎉</div>
            <div className="text-muted-foreground">Stock suficiente en todos los productos</div>
          </Card>
        ) : (
          <div className="space-y-2">
            {toReplenish.map((p) => {
              const status = stockStatus(p);
              const isLow = status === "bajo";
              const isCritical = status === "critico";
              return (
                <Card
                  key={p.id}
                  className={`p-3 border-l-4 transition-all ${
                    isCritical
                      ? "border-l-destructive bg-destructive/5"
                      : "border-l-warning bg-warning/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="font-medium truncate">{p.name}</span>
                      <StockStatusBadge status={status} />
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-lg font-bold tabular-nums">{formatQty(p.currentQuantity)}</span>{" "}
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

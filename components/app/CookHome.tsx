"use client";

import Link from "next/link";
import { Utensils, Wine, Ship, PackageCheck, ChefHat } from "lucide-react";
import { useProducts, usePreparedDishes } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { stockStatus, isToday } from "@/lib/domain/stock";
import { formatQty } from "@/lib/utils";
import { PageContainer, DemoBanner } from "@/components/app/common";
import { StockStatusBadge } from "@/components/app/StockStatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Home minimalista para cocinero / operario (y solo-lectura).
 * Sin plata ni números de gestión: dos acciones grandes + qué reponer.
 */
export function CookHome() {
  const { user, activeCharter } = useRepoContext();
  const { data: products } = useProducts();
  const { data: prepared } = usePreparedDishes();

  const toReplenish = products
    .filter((p) => p.active && stockStatus(p) !== "normal")
    .sort((a, b) => (stockStatus(a) === "critico" ? -1 : 1))
    .slice(0, 8);

  const servingsToday = prepared
    .filter((p) => isToday(p.preparedAt))
    .reduce((s, p) => s + p.servings, 0);

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
        <Button asChild size="xl" variant="success" className="h-20 text-xl justify-start gap-4">
          <Link href="/preparar">
            <Utensils className="h-8 w-8" />
            Preparar plato
          </Link>
        </Button>
        <Button asChild size="xl" className="h-20 text-xl justify-start gap-4">
          <Link href="/bebidas">
            <Wine className="h-8 w-8" />
            Cargar bebida
          </Link>
        </Button>
      </div>

      {/* Platos de hoy */}
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-success/10 text-success flex items-center justify-center">
            <ChefHat className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold leading-none">{servingsToday}</div>
            <div className="text-sm text-muted-foreground">porciones preparadas hoy</div>
          </div>
        </CardContent>
      </Card>

      {/* Para reponer */}
      <div>
        <h2 className="font-semibold mb-2 flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-muted-foreground" />
          Para reponer
        </h2>
        {toReplenish.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground text-center">
            Todo con stock suficiente 🎉
          </Card>
        ) : (
          <div className="space-y-2">
            {toReplenish.map((p) => (
              <Card key={p.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{p.name}</span>
                    <StockStatusBadge status={stockStatus(p)} />
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-lg font-bold tabular-nums">{formatQty(p.currentQuantity)}</span>{" "}
                    <span className="text-xs text-muted-foreground">{p.unit}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

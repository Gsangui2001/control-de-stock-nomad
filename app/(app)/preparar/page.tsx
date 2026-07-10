"use client";

import { useState } from "react";
import { ChefHat, Utensils } from "lucide-react";
import Link from "next/link";
import { useProducts, useRecipes } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { possibleServings, recipeServingCost } from "@/lib/domain/stock";
import type { Recipe } from "@/lib/domain/types";
import { canOperate, canManage } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";
import {
  PageContainer,
  PageTitle,
  EmptyState,
  ListSkeleton,
  DemoBanner,
} from "@/components/app/common";
import { PrepareDishSheet } from "@/components/preparar/PrepareDishSheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function PrepararPage() {
  const { data: recipes, loading } = useRecipes();
  const { data: products } = useProducts();
  const { user, settings } = useRepoContext();
  const [selected, setSelected] = useState<Recipe | null>(null);

  const activeRecipes = recipes.filter((r) => r.active);
  const canPrep = canOperate(user?.role);
  const showCosts = canManage(user?.role);

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle title="Preparar platos" subtitle="Elegí un plato y las porciones" />

      {!canPrep && (
        <p className="text-sm text-muted-foreground">
          Tu rol es de solo lectura: podés ver los platos pero no registrar preparaciones.
        </p>
      )}

      {loading ? (
        <ListSkeleton />
      ) : activeRecipes.length === 0 ? (
        <EmptyState
          icon={<ChefHat className="h-8 w-8" />}
          title="Sin platos"
          description="Creá recetas en la sección Platos / Recetas."
          action={
            <Button asChild>
              <Link href="/platos">Ir a Platos</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {activeRecipes.map((r) => {
            const max = possibleServings(r, products);
            const cost = recipeServingCost(r, products);
            const mainItems = r.items.slice(0, 3);
            const productName = (id: string) =>
              products.find((p) => p.id === id)?.name ?? "?";
            return (
              <Card key={r.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center text-4xl">
                    {r.icon ?? "🍽️"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-lg leading-tight">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {mainItems.map((i) => productName(i.productId)).join(", ")}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  {showCosts ? (
                    <span className="text-muted-foreground">
                      {formatMoney(cost, settings.currency)}/porción
                    </span>
                  ) : (
                    <span />
                  )}
                  <Badge variant={max > 0 ? "success" : "destructive"}>
                    {max > 0 ? `${max} porc. disponibles` : "Sin stock"}
                  </Badge>
                </div>

                <Button
                  size="xl"
                  variant="success"
                  className="w-full"
                  disabled={!canPrep}
                  onClick={() => setSelected(r)}
                >
                  <Utensils className="h-6 w-6" />
                  Preparar
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <PrepareDishSheet
        recipe={selected}
        products={products}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </PageContainer>
  );
}

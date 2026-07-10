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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {activeRecipes.map((r) => {
            const max = possibleServings(r, products);
            const cost = recipeServingCost(r, products);
            const mainItems = r.items.slice(0, 3);
            const productName = (id: string) =>
              products.find((p) => p.id === id)?.name ?? "?";
            return (
              <Card key={r.id} className="overflow-hidden animate-fade-up">
                <div className="flex items-start gap-4 p-5 pb-3">
                  <div className="h-20 w-20 shrink-0 rounded-2xl bg-gradient-to-br from-secondary to-secondary/60 flex items-center justify-center text-[44px] shadow-inner">
                    {r.icon ?? "🍽️"}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="font-bold text-lg leading-tight">{r.name}</div>
                    <div className="text-sm text-muted-foreground truncate mt-1">
                      {mainItems.map((i) => productName(i.productId)).join(" · ")}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold">
                      <span
                        className={
                          "h-2 w-2 rounded-full " + (max > 0 ? "bg-success" : "bg-destructive")
                        }
                      />
                      <span className={max > 0 ? "text-success" : "text-destructive"}>
                        {max > 0 ? `${max} porciones disponibles` : "Sin stock"}
                      </span>
                      {showCosts && (
                        <span className="font-normal text-muted-foreground">
                          · {formatMoney(cost, settings.currency)}/porc.
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-2">
                  <Button
                    size="xl"
                    variant="success"
                    className="w-full"
                    disabled={!canPrep}
                    onClick={() => setSelected(r)}
                  >
                    <Utensils className="!h-6 !w-6" />
                    Preparar
                  </Button>
                </div>
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

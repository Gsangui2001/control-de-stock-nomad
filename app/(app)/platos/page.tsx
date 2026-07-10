"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Plus, Copy, Power } from "lucide-react";
import { useProducts, useRecipes } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { recipeServingCost, possibleServings } from "@/lib/domain/stock";
import { canManage } from "@/lib/permissions";
import { formatMoney, uid } from "@/lib/utils";
import type { Recipe } from "@/lib/domain/types";
import {
  PageContainer,
  PageTitle,
  EmptyState,
  ListSkeleton,
  DemoBanner,
} from "@/components/app/common";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function PlatosPage() {
  const { data: recipes, loading } = useRecipes();
  const { data: products } = useProducts();
  const { repo, refresh, user, settings } = useRepoContext();
  const router = useRouter();
  const manage = canManage(user?.role);

  async function createNew() {
    const now = new Date().toISOString();
    const recipe: Recipe = {
      id: uid("rec-"),
      name: "Nuevo plato",
      active: true,
      items: [],
      createdAt: now,
      updatedAt: now,
      icon: "🍽️",
    };
    await repo.upsertRecipe(recipe);
    refresh();
    router.push(`/platos/${recipe.id}`);
  }

  async function duplicate(r: Recipe) {
    const copy = await repo.duplicateRecipe(r.id);
    refresh();
    toast.success("Plato duplicado");
    router.push(`/platos/${copy.id}`);
  }

  async function toggleActive(r: Recipe) {
    await repo.upsertRecipe({ ...r, active: !r.active });
    refresh();
  }

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle
        title="Platos / Recetas"
        subtitle={`${recipes.length} platos`}
        action={
          manage ? (
            <Button size="icon" aria-label="Nuevo plato" onClick={createNew}>
              <Plus className="h-5 w-5" />
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <ListSkeleton />
      ) : recipes.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" />}
          title="Sin recetas"
          description="Creá tu primer plato estandarizado."
          action={manage ? <Button onClick={createNew}>Crear plato</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {recipes.map((r) => {
            const cost = recipeServingCost(r, products);
            const max = possibleServings(r, products);
            return (
              <Card key={r.id} className="p-3">
                <div className="flex items-center gap-3">
                  <Link href={`/platos/${r.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-12 w-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
                      {r.icon ?? "🍽️"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{r.name}</span>
                        {!r.active && <Badge variant="outline">Inactivo</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.items.length} ingredientes · {formatMoney(cost, settings.currency)}/porción · {max} disp.
                      </div>
                    </div>
                  </Link>
                  {manage && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="icon" variant="ghost" aria-label="Duplicar" onClick={() => duplicate(r)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Activar/desactivar" onClick={() => toggleActive(r)}>
                        <Power className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

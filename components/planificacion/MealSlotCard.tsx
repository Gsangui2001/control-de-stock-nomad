"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Check, Utensils, Wine, Pencil } from "lucide-react";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { useProducts, useRecipes } from "@/lib/hooks";
import type { MealSlot, PlannedMeal } from "@/lib/domain/types";
import { mealSlotLabel, mealSlotIcon, mealItemCount } from "@/lib/domain/planning";
import { canManage, canOperate } from "@/lib/permissions";
import { formatQty } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function MealSlotCard({
  date,
  slot,
  meal,
  onEdit,
}: {
  date: string;
  slot: MealSlot;
  meal?: PlannedMeal;
  onEdit: (slot: MealSlot, meal?: PlannedMeal) => void;
}) {
  const { repo, refresh, user } = useRepoContext();
  const { data: recipes } = useRecipes();
  const { data: products } = useProducts();
  const [busy, setBusy] = useState(false);
  const manage = canManage(user?.role);
  const operate = canOperate(user?.role);

  const recipeName = (id: string) => recipes.find((r) => r.id === id)?.name ?? "?";
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "?";

  const isPrepared = meal?.status === "preparado";
  const count = meal ? mealItemCount(meal) : 0;

  async function markPrepared() {
    if (!meal) return;
    setBusy(true);
    const results = await repo.markMealPrepared(meal.id);
    setBusy(false);
    const failed = results.find((r) => !r.ok);
    if (failed?.shortages?.length) {
      toast.error("No hay stock suficiente", {
        description: failed.shortages
          .map((s) => `${s.productName}: faltan ${formatQty(s.needed - s.available)} ${s.unit}`)
          .join(" · "),
      });
      return;
    }
    refresh();
    toast.success(`${mealSlotLabel(slot)} preparado`, {
      description: "Stock descontado",
    });
  }

  return (
    <Card className={isPrepared ? "border-success/50 bg-success/5" : ""}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{mealSlotIcon(slot)}</span>
            <span className="font-semibold">{mealSlotLabel(slot)}</span>
            {isPrepared && <Badge variant="success">Preparado</Badge>}
          </div>
          {manage && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Editar comida"
              onClick={() => onEdit(slot, meal)}
              disabled={isPrepared}
            >
              {count > 0 ? <Pencil className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
            </Button>
          )}
        </div>

        {count === 0 ? (
          <p className="text-xs text-muted-foreground">
            {manage ? "Tocá + para planificar" : "Sin planificar"}
          </p>
        ) : (
          <div className="space-y-1.5">
            {meal!.dishes.map((d, i) => (
              <div key={`d${i}`} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Utensils className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{recipeName(d.recipeId)}</span>
                </span>
                <Badge variant="secondary">{d.servings} porc.</Badge>
              </div>
            ))}
            {meal!.beverages.map((b, i) => (
              <div key={`b${i}`} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Wine className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{productName(b.productId)}</span>
                </span>
                <Badge variant="secondary">{b.quantity}</Badge>
              </div>
            ))}

            {!isPrepared && operate && (
              <Button
                size="lg"
                variant="success"
                className="w-full mt-2"
                disabled={busy}
                onClick={markPrepared}
              >
                <Check className="h-5 w-5" /> Marcar preparado
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

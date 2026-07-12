"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Check, Utensils, Wine, Pencil, CheckCheck, Ban } from "lucide-react";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { useProducts, useRecipes } from "@/lib/hooks";
import type { MealSlot, PlannedMeal } from "@/lib/domain/types";
import { mealSlotLabel, mealSlotIcon, mealItemCount } from "@/lib/domain/planning";
import { canManage, canOperate } from "@/lib/permissions";
import { formatQty } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

  const status = meal?.status;
  const isPlanned = status === "planificado";
  const isPrepared = status === "preparado";
  const isServed = status === "servida";
  const isCancelled = status === "cancelada";
  const editable = !meal || isPlanned;
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
    toast.success(`${mealSlotLabel(slot)} preparado`, { description: "Stock descontado" });
  }

  async function markServed() {
    if (!meal) return;
    setBusy(true);
    await repo.markMealServed(meal.id);
    setBusy(false);
    refresh();
    toast.success(`${mealSlotLabel(slot)} servido`);
  }

  async function cancel() {
    if (!meal) return;
    setBusy(true);
    await repo.cancelMealPlan(meal.id);
    setBusy(false);
    refresh();
    toast.success(`${mealSlotLabel(slot)} cancelado`);
  }

  return (
    <Card
      className={
        isPrepared
          ? "border-l-4 border-l-success"
          : isServed
          ? "border-l-4 border-l-accent"
          : isCancelled
          ? "opacity-50 border-l-4 border-l-border"
          : isPlanned && count > 0
          ? "border-l-4 border-l-ocean"
          : ""
      }
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
              {mealSlotIcon(slot)}
            </span>
            <div className="min-w-0">
              <span className="font-bold text-lg">{mealSlotLabel(slot)}</span>
              <div className="flex items-center gap-2 mt-0.5">
                {isPlanned && count > 0 && <Badge variant="info">Planificado</Badge>}
                {isPrepared && <Badge variant="success">Preparado</Badge>}
                {isServed && <Badge variant="accent">Servida</Badge>}
                {isCancelled && <Badge variant="outline">Cancelada</Badge>}
              </div>
            </div>
          </div>
          {manage && editable && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Editar comida"
              className="shrink-0 hover:bg-primary/10"
              onClick={() => onEdit(slot, meal)}
            >
              {count > 0 ? <Pencil className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
            </Button>
          )}
        </div>

        {count === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            {manage ? "Tocá + para planificar esta comida" : "Sin planificar"}
          </p>
        ) : (
          <div className="space-y-1">
            {meal!.dishes.map((d, i) => (
              <div key={`d${i}`} className="flex items-center justify-between text-sm py-2 px-0">
                <span className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Utensils className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium truncate">{recipeName(d.recipeId)}</span>
                </span>
                <Badge variant="secondary" className="shrink-0">{d.servings}p</Badge>
              </div>
            ))}
            {meal!.beverages.map((b, i) => (
              <div key={`b${i}`} className="flex items-center justify-between text-sm py-2 px-0">
                <span className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Wine className="h-4 w-4 text-accent shrink-0" />
                  <span className="font-medium truncate">{productName(b.productId)}</span>
                </span>
                <Badge variant="secondary" className="shrink-0">{b.quantity}</Badge>
              </div>
            ))}

            <div className="flex flex-col gap-2 pt-3 border-t">
              {isPlanned && operate && (
                <Button
                  size="lg"
                  variant="success"
                  className="w-full font-semibold"
                  disabled={busy}
                  onClick={markPrepared}
                >
                  <Check className="h-5 w-5" /> Marcar preparado
                </Button>
              )}

              {isPrepared && operate && (
                <Button
                  size="lg"
                  className="w-full font-semibold"
                  disabled={busy}
                  onClick={markServed}
                >
                  <CheckCheck className="h-5 w-5" /> Marcar servido
                </Button>
              )}

              {isPlanned && manage && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="w-full text-destructive hover:text-destructive" disabled={busy}>
                      <Ban className="h-4 w-4" /> Cancelar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Cancelar {mealSlotLabel(slot).toLowerCase()}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        No se descuenta stock (todavía no se preparó). Podés volver a planificarla
                        creando una nueva.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Volver</AlertDialogCancel>
                      <AlertDialogAction onClick={cancel}>Cancelar comida</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Utensils, Wine } from "lucide-react";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { useProducts, useRecipes } from "@/lib/hooks";
import type { MealSlot, PlannedMeal, PlannedDish, PlannedBeverage } from "@/lib/domain/types";
import { mealSlotLabel, mealSlotIcon, defaultServings } from "@/lib/domain/planning";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function AddMealSheet({
  open,
  onOpenChange,
  date,
  slot,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  slot: MealSlot;
  existing?: PlannedMeal;
}) {
  const { repo, refresh, activeCharter } = useRepoContext();
  const { data: recipes } = useRecipes();
  const { data: products } = useProducts();
  const [dishes, setDishes] = useState<PlannedDish[]>([]);
  const [beverages, setBeverages] = useState<PlannedBeverage[]>([]);

  const activeRecipes = recipes.filter((r) => r.active);
  const bevs = products.filter((p) => p.category === "bebidas");
  const defServ = defaultServings(activeCharter);

  useEffect(() => {
    if (open) {
      setDishes(existing?.dishes ? [...existing.dishes] : []);
      setBeverages(existing?.beverages ? [...existing.beverages] : []);
    }
  }, [open, existing]);

  function addDish() {
    if (!activeRecipes.length) {
      toast.error("Primero creá platos en Platos / Recetas");
      return;
    }
    setDishes([...dishes, { recipeId: activeRecipes[0].id, servings: defServ }]);
  }
  function addBev() {
    if (!bevs.length) {
      toast.error("No hay bebidas cargadas");
      return;
    }
    setBeverages([...beverages, { productId: bevs[0].id, quantity: defServ }]);
  }

  async function save() {
    if (dishes.length === 0 && beverages.length === 0) {
      // vacío = borrar la comida si existía
      if (existing) await repo.deleteMealPlan(existing.id);
      onOpenChange(false);
      refresh();
      return;
    }
    const meal: PlannedMeal = {
      id: existing?.id ?? uid("plan-"),
      charterId: existing?.charterId ?? activeCharter?.id,
      date,
      slot,
      dishes,
      beverages,
      status: existing?.status ?? "planificado",
      preparedDishIds: existing?.preparedDishIds,
      createdBy: existing?.createdBy ?? "",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await repo.upsertMealPlan(meal);
    refresh();
    toast.success(`${mealSlotLabel(slot)} guardado`);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="text-2xl">{mealSlotIcon(slot)}</span>
            {mealSlotLabel(slot)}
          </SheetTitle>
          <SheetDescription>
            {activeCharter ? `Charter ${activeCharter.code} · ` : ""}
            Porciones por defecto: {defServ}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {/* Platos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Utensils className="h-4 w-4" /> Platos
              </Label>
              <Button size="sm" variant="outline" onClick={addDish}>
                <Plus className="h-4 w-4" /> Plato
              </Button>
            </div>
            {dishes.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin platos.</p>
            )}
            {dishes.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={d.recipeId}
                  onValueChange={(v) =>
                    setDishes(dishes.map((x, idx) => (idx === i ? { ...x, recipeId: v } : x)))
                  }
                >
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeRecipes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.icon} {r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  className="w-20 text-center"
                  value={d.servings}
                  onChange={(e) =>
                    setDishes(dishes.map((x, idx) => (idx === i ? { ...x, servings: Math.max(1, Number(e.target.value)) } : x)))
                  }
                />
                <Button size="icon" variant="ghost" aria-label="Quitar plato" onClick={() => setDishes(dishes.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {/* Bebidas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Wine className="h-4 w-4" /> Bebidas
              </Label>
              <Button size="sm" variant="outline" onClick={addBev}>
                <Plus className="h-4 w-4" /> Bebida
              </Button>
            </div>
            {beverages.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin bebidas.</p>
            )}
            {beverages.map((b, i) => {
              const prod = products.find((p) => p.id === b.productId);
              return (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={b.productId}
                    onValueChange={(v) =>
                      setBeverages(beverages.map((x, idx) => (idx === i ? { ...x, productId: v } : x)))
                    }
                  >
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {bevs.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    className="w-20 text-center"
                    value={b.quantity}
                    onChange={(e) =>
                      setBeverages(beverages.map((x, idx) => (idx === i ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x)))
                    }
                  />
                  <span className="text-xs text-muted-foreground w-10">{prod?.unit}</span>
                  <Button size="icon" variant="ghost" aria-label="Quitar bebida" onClick={() => setBeverages(beverages.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>

          <Button size="xl" className="w-full" onClick={save}>
            Guardar {mealSlotLabel(slot).toLowerCase()}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

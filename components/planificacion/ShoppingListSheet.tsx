"use client";

import { useMemo } from "react";
import { Download, ShoppingCart, CheckCircle2 } from "lucide-react";
import type { PlannedMeal } from "@/lib/domain/types";
import { useProducts, useRecipes } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import {
  computePlanNeeds,
  computeShortages,
  buildShoppingList,
  shoppingListTotal,
} from "@/lib/domain/planning";
import { CATEGORY_LABEL } from "@/lib/domain/units";
import { canManage } from "@/lib/permissions";
import { formatMoney, formatQty } from "@/lib/utils";
import { toCSV, downloadCSV } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function ShoppingListSheet({
  open,
  onOpenChange,
  plans,
  scopeLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plans: PlannedMeal[];
  scopeLabel: string;
}) {
  const { data: products } = useProducts();
  const { data: recipes } = useRecipes();
  const { user, settings } = useRepoContext();
  const showCosts = canManage(user?.role);

  const items = useMemo(() => {
    const needs = computePlanNeeds(plans, recipes, products);
    const shortages = computeShortages(needs, products);
    return buildShoppingList(shortages, products);
  }, [plans, recipes, products]);

  const total = shoppingListTotal(items);

  // Agrupar por categoría
  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const it of items) {
      const arr = map.get(it.category) ?? [];
      arr.push(it);
      map.set(it.category, arr);
    }
    return Array.from(map.entries());
  }, [items]);

  function exportCSV() {
    const csv = toCSV(
      items.map((i) => ({
        producto: i.productName,
        categoria: CATEGORY_LABEL[i.category],
        necesario: i.needed,
        en_stock: i.available,
        comprar: i.missing,
        unidad: i.unit,
        costo_estimado: i.estimatedCost.toFixed(2),
      }))
    );
    downloadCSV("lista-de-compras.csv", csv);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" /> Lista de compras sugerida
          </SheetTitle>
          <SheetDescription>{scopeLabel}</SheetDescription>
        </SheetHeader>

        {items.length === 0 ? (
          <Card className="p-6 flex flex-col items-center text-center gap-2 border-dashed">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <div className="font-semibold">Todo cubierto</div>
            <p className="text-sm text-muted-foreground">
              Hay stock suficiente para las comidas planificadas.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {grouped.map(([cat, list]) => (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
                  {CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL] ?? cat}
                </h3>
                <div className="space-y-1.5">
                  {list.map((it) => (
                    <div key={it.productId} className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{it.productName}</div>
                        <div className="text-xs text-muted-foreground">
                          necesario {formatQty(it.needed)} · hay {formatQty(it.available)} {it.unit}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold tabular-nums">
                          {formatQty(it.missing)} {it.unit}
                        </div>
                        {showCosts && (
                          <div className="text-[11px] text-muted-foreground">
                            {formatMoney(it.estimatedCost, settings.currency)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {showCosts && (
              <div className="flex items-center justify-between px-1 pt-2 border-t">
                <span className="text-sm text-muted-foreground">Costo estimado total</span>
                <span className="text-lg font-bold">{formatMoney(total, settings.currency)}</span>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={exportCSV}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

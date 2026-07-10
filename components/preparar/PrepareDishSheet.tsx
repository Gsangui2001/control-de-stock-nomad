"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Ship } from "lucide-react";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import type { Product, Recipe } from "@/lib/domain/types";
import {
  computeDeductions,
  possibleServings,
  recipeServingCost,
} from "@/lib/domain/stock";
import { canManage } from "@/lib/permissions";
import { cn, formatMoney, formatQty } from "@/lib/utils";
import { QuantityStepper } from "@/components/app/QuantityStepper";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function PrepareDishSheet({
  recipe,
  products,
  open,
  onOpenChange,
}: {
  recipe: Recipe | null;
  products: Product[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { repo, refresh, activeCharter, settings, user } = useRepoContext();
  const [servings, setServings] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const showCosts = canManage(user?.role);
  const QUICK_SERVINGS = [2, 4, 6, 8, 10];

  const maxServings = useMemo(
    () => (recipe ? possibleServings(recipe, products) : 0),
    [recipe, products]
  );

  const deductions = useMemo(
    () => (recipe ? computeDeductions(recipe, servings, products) : []),
    [recipe, servings, products]
  );

  const totalCost = deductions.reduce((s, d) => s + d.cost, 0);
  const hasShortage = deductions.some((d) => d.short);

  if (!recipe) return null;

  async function confirm() {
    if (!recipe) return;
    setSubmitting(true);
    const res = await repo.prepareDish({
      recipeId: recipe.id,
      servings,
      charterId: activeCharter?.id,
    });
    setSubmitting(false);
    if (res.ok) {
      refresh();
      toast.success(`${servings} porción(es) de ${recipe.name} preparadas`, {
        description: showCosts
          ? `Ingredientes descontados · ${formatMoney(totalCost, settings.currency)}`
          : "Ingredientes descontados del stock",
      });
      onOpenChange(false);
      setServings(1);
    } else if (res.shortages) {
      toast.error("No hay stock suficiente", {
        description: res.shortages
          .map((s) => `${s.productName}: faltan ${formatQty(s.needed - s.available)} ${s.unit}`)
          .join(" · "),
      });
    } else {
      toast.error("No se pudo preparar el plato");
    }
  }

  const blocked = hasShortage && !settings.allowNegativeStock;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl">
            <span className="text-2xl">{recipe.icon ?? "🍽️"}</span>
            {recipe.name}
          </SheetTitle>
          <SheetDescription>
            {activeCharter ? (
              <span className="inline-flex items-center gap-1">
                <Ship className="h-3.5 w-3.5" /> Charter {activeCharter.code}
              </span>
            ) : (
              "Sin charter activo"
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3 py-2">
            <span className="text-sm text-muted-foreground">¿Cuántas porciones?</span>
            <QuantityStepper value={servings} onChange={setServings} min={1} />
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_SERVINGS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setServings(n)}
                  className={cn(
                    "h-11 w-14 rounded-xl border text-lg font-semibold transition-colors active:scale-[0.97]",
                    servings === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-accent/10"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              Máximo con stock actual: <strong>{maxServings}</strong>
            </span>
          </div>

          <div className="rounded-2xl border divide-y">
            <div className="px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/40 rounded-t-2xl">
              Se van a descontar
            </div>
            {deductions.map((d) => (
              <div key={d.productId} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {d.short ? (
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  )}
                  <span className="truncate">{d.productName}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className={"font-semibold tabular-nums " + (d.short ? "text-destructive" : "")}>
                    −{formatQty(d.needed)} {d.unit}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    quedan {formatQty(d.available - d.needed)} {d.unit}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {showCosts && (
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-muted-foreground">Costo estimado</span>
              <span className="text-lg font-bold">{formatMoney(totalCost, settings.currency)}</span>
            </div>
          )}

          {blocked && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <span>
                No hay stock suficiente. Ajustá las porciones o cargá una compra.
                (El admin puede permitir stock negativo en Configuración.)
              </span>
            </div>
          )}

          <Button
            size="xl"
            className="w-full"
            variant={blocked ? "outline" : "success"}
            disabled={submitting || blocked}
            onClick={confirm}
          >
            {blocked ? "Sin stock suficiente" : `Confirmar preparación`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

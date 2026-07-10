// Pure meal-planning logic — no I/O. Mirrors the style of lib/domain/stock.ts.
import type {
  PlannedMeal,
  MealSlot,
  Recipe,
  Product,
  Charter,
  Unit,
  CategoryKey,
} from "./types";

export const MEAL_SLOTS: { key: MealSlot; label: string; icon: string }[] = [
  { key: "desayuno", label: "Desayuno", icon: "🍳" },
  { key: "almuerzo", label: "Almuerzo", icon: "🍽️" },
  { key: "merienda", label: "Merienda", icon: "🧁" },
  { key: "cena", label: "Cena", icon: "🌙" },
  { key: "snack", label: "Snack", icon: "🍿" },
  { key: "extras", label: "Extras", icon: "🧺" },
];

export function mealSlotLabel(slot: MealSlot): string {
  return MEAL_SLOTS.find((s) => s.key === slot)?.label ?? slot;
}

export function mealSlotIcon(slot: MealSlot): string {
  return MEAL_SLOTS.find((s) => s.key === slot)?.icon ?? "🍽️";
}

/** Porciones por defecto al planificar: comensales del charter. */
export function defaultServings(charter?: Charter): number {
  return charter?.guestCount && charter.guestCount > 0 ? charter.guestCount : 1;
}

export interface ProductNeed {
  productId: string;
  quantity: number;
  unit: Unit;
}

/**
 * Ingredientes necesarios para un conjunto de comidas PLANIFICADAS (no preparadas).
 * Suma, por cada plato, quantityPerServing * servings; por cada bebida, su cantidad.
 */
export function computePlanNeeds(
  plans: PlannedMeal[],
  recipes: Recipe[],
  products: Product[]
): ProductNeed[] {
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const needs = new Map<string, ProductNeed>();

  const add = (productId: string, qty: number, unit: Unit) => {
    const cur = needs.get(productId);
    if (cur) cur.quantity += qty;
    else needs.set(productId, { productId, quantity: qty, unit });
  };

  for (const plan of plans) {
    if (plan.status !== "planificado") continue;
    for (const dish of plan.dishes) {
      const recipe = recipeById.get(dish.recipeId);
      if (!recipe) continue;
      for (const item of recipe.items) {
        add(item.productId, item.quantityPerServing * dish.servings, item.unit);
      }
    }
    for (const bev of plan.beverages) {
      const p = productById.get(bev.productId);
      add(bev.productId, bev.quantity, p?.unit ?? "unidad");
    }
  }

  return Array.from(needs.values());
}

export interface Shortage {
  productId: string;
  productName: string;
  category: CategoryKey;
  needed: number;
  available: number;
  missing: number;
  unit: Unit;
}

/** Faltantes = necesario − stock actual (solo los que faltan). */
export function computeShortages(
  needs: ProductNeed[],
  products: Product[]
): Shortage[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: Shortage[] = [];
  for (const need of needs) {
    const p = byId.get(need.productId);
    const available = p?.currentQuantity ?? 0;
    const missing = Math.max(0, need.quantity - available);
    if (missing <= 0) continue;
    out.push({
      productId: need.productId,
      productName: p?.name ?? "(insumo)",
      category: p?.category ?? "secos",
      needed: round(need.quantity),
      available: round(available),
      missing: round(missing),
      unit: need.unit,
    });
  }
  return out.sort((a, b) => a.productName.localeCompare(b.productName));
}

export interface ShoppingItem extends Shortage {
  estimatedCost: number;
}

/** Lista de compras sugerida: faltantes con costo estimado. */
export function buildShoppingList(
  shortages: Shortage[],
  products: Product[]
): ShoppingItem[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return shortages.map((s) => {
    const cost = (byId.get(s.productId)?.averageUnitCost ?? 0) * s.missing;
    return { ...s, estimatedCost: round(cost) };
  });
}

export function shoppingListTotal(items: ShoppingItem[]): number {
  return round(items.reduce((sum, i) => sum + i.estimatedCost, 0));
}

/** Cantidad de platos/bebidas planificados en una comida. */
export function mealItemCount(meal: PlannedMeal): number {
  return meal.dishes.length + meal.beverages.length;
}

function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * f) / f;
}

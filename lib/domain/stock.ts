// Pure business logic — no I/O. Shared by demoRepo and supabaseRepo.
import type {
  Product,
  Recipe,
  StockStatus,
  Settings,
  Alert,
  Charter,
  StockMovement,
} from "./types";
import { CATEGORY_LABEL } from "./units";

/**
 * Weighted average unit cost after a purchase.
 * new = (qActual*costActual + qCompra*costCompra) / (qActual + qCompra)
 */
export function weightedAverageCost(
  currentQty: number,
  currentCost: number,
  incomingQty: number,
  incomingUnitCost: number
): number {
  const totalQty = currentQty + incomingQty;
  if (totalQty <= 0) return incomingUnitCost;
  const blended =
    (Math.max(currentQty, 0) * currentCost + incomingQty * incomingUnitCost) /
    totalQty;
  return Math.round((blended + Number.EPSILON) * 10000) / 10000;
}

export function stockStatus(product: Product): StockStatus {
  if (product.currentQuantity <= product.criticalQuantity) return "critico";
  if (product.currentQuantity <= product.minimumQuantity) return "bajo";
  return "normal";
}

export function productValue(product: Product): number {
  return Math.max(product.currentQuantity, 0) * product.averageUnitCost;
}

export function totalStockValue(products: Product[]): number {
  return products.reduce((sum, p) => sum + productValue(p), 0);
}

/** Cost of one serving of a recipe, given current product costs. */
export function recipeServingCost(recipe: Recipe, products: Product[]): number {
  const byId = new Map(products.map((p) => [p.id, p]));
  return recipe.items.reduce((sum, item) => {
    const p = byId.get(item.productId);
    if (!p) return sum;
    return sum + item.quantityPerServing * p.averageUnitCost;
  }, 0);
}

/** How many servings of a recipe can be prepared with current stock. */
export function possibleServings(recipe: Recipe, products: Product[]): number {
  const byId = new Map(products.map((p) => [p.id, p]));
  if (recipe.items.length === 0) return 0;
  let min = Infinity;
  for (const item of recipe.items) {
    const p = byId.get(item.productId);
    if (!p || item.quantityPerServing <= 0) {
      // ingredient missing from stock -> cannot prepare
      return 0;
    }
    const canMake = Math.floor(p.currentQuantity / item.quantityPerServing);
    if (canMake < min) min = canMake;
  }
  return Number.isFinite(min) ? Math.max(min, 0) : 0;
}

export interface Deduction {
  productId: string;
  productName: string;
  needed: number;
  available: number;
  unit: Product["unit"];
  cost: number;
  short: boolean;
}

/** Compute per-ingredient deductions for preparing `servings` of a recipe. */
export function computeDeductions(
  recipe: Recipe,
  servings: number,
  products: Product[]
): Deduction[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return recipe.items.map((item) => {
    const p = byId.get(item.productId);
    const needed = item.quantityPerServing * servings;
    const available = p?.currentQuantity ?? 0;
    return {
      productId: item.productId,
      productName: p?.name ?? "(insumo faltante)",
      needed,
      available,
      unit: item.unit,
      cost: (p?.averageUnitCost ?? 0) * needed,
      short: available < needed,
    };
  });
}

export function isToday(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function daysUntil(iso: string, now = new Date()): number {
  const d = new Date(iso);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Derive all alerts from current state. Alerts are computed, never stored
 * (in demo mode). Sorted by severity.
 */
export function computeAlerts(
  products: Product[],
  recipes: Recipe[],
  settings: Settings,
  charters: Charter[],
  movements: StockMovement[],
  activeCharterId?: string,
  now = new Date()
): Alert[] {
  const alerts: Alert[] = [];
  const byId = new Map(products.map((p) => [p.id, p]));

  for (const p of products) {
    if (!p.active) continue;
    const status = stockStatus(p);
    if (status === "critico") {
      alerts.push({
        id: `crit-${p.id}`,
        kind: "stock_critico",
        level: "critical",
        title: `${p.name} en nivel crítico`,
        detail: `Quedan ${p.currentQuantity} ${p.unit} (crítico ≤ ${p.criticalQuantity})`,
        productId: p.id,
      });
    } else if (status === "bajo") {
      alerts.push({
        id: `bajo-${p.id}`,
        kind: "stock_bajo",
        level: "warning",
        title: `${p.name} con stock bajo`,
        detail: `Quedan ${p.currentQuantity} ${p.unit} (mínimo ${p.minimumQuantity})`,
        productId: p.id,
      });
    }
    if (p.currentQuantity < 0) {
      alerts.push({
        id: `neg-${p.id}`,
        kind: "stock_negativo",
        level: "critical",
        title: `${p.name} con stock negativo`,
        detail: `${p.currentQuantity} ${p.unit}. Revisá los movimientos.`,
        productId: p.id,
      });
    }
    if (p.averageUnitCost <= 0 && p.active) {
      alerts.push({
        id: `costo-${p.id}`,
        kind: "sin_costo",
        level: "info",
        title: `${p.name} sin costo cargado`,
        detail: `Cargá una compra o ajustá el costo unitario.`,
        productId: p.id,
      });
    }
    if (p.expirationDate) {
      const d = daysUntil(p.expirationDate, now);
      if (d < 0) {
        alerts.push({
          id: `venc-${p.id}`,
          kind: "vencido",
          level: "critical",
          title: `${p.name} vencido`,
          detail: `Venció hace ${Math.abs(d)} día(s).`,
          productId: p.id,
        });
      } else if (d <= settings.expiryWarningDays) {
        alerts.push({
          id: `porvenc-${p.id}`,
          kind: "por_vencer",
          level: "warning",
          title: `${p.name} próximo a vencer`,
          detail: `Vence en ${d} día(s).`,
          productId: p.id,
        });
      }
    }
  }

  for (const r of recipes) {
    if (!r.active) continue;
    if (r.items.length === 0) {
      alerts.push({
        id: `recinc-${r.id}`,
        kind: "receta_incompleta",
        level: "info",
        title: `Receta "${r.name}" sin ingredientes`,
        detail: `Cargá los ingredientes para poder prepararla.`,
        recipeId: r.id,
      });
      continue;
    }
    for (const item of r.items) {
      const p = byId.get(item.productId);
      if (!p) {
        alerts.push({
          id: `recno-${r.id}-${item.productId}`,
          kind: "receta_sin_stock",
          level: "warning",
          title: `Receta "${r.name}" usa un insumo inexistente`,
          detail: `Falta un ingrediente en el stock.`,
          recipeId: r.id,
        });
      } else if (p.currentQuantity <= 0) {
        alerts.push({
          id: `recss-${r.id}-${item.productId}`,
          kind: "receta_sin_stock",
          level: "warning",
          title: `"${r.name}" no se puede preparar`,
          detail: `Sin stock de ${p.name}.`,
          recipeId: r.id,
          productId: p.id,
        });
      }
    }
  }

  if (activeCharterId) {
    const charter = charters.find((c) => c.id === activeCharterId);
    const hasConsumption = movements.some(
      (m) => m.charterId === activeCharterId
    );
    if (charter && !hasConsumption) {
      alerts.push({
        id: `charter-${charter.id}`,
        kind: "charter_sin_consumo",
        level: "info",
        title: `Charter ${charter.code} activo sin consumo`,
        detail: `Todavía no registraste platos ni bebidas en este charter.`,
        charterId: charter.id,
      });
    }
  }

  const order = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

export function categoryLabel(key: Product["category"]): string {
  return CATEGORY_LABEL[key] ?? key;
}

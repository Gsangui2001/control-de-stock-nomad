import type { Repo, MovementFilter, AdjustStockInput } from "./Repo";
import type {
  Product,
  Recipe,
  Purchase,
  PurchaseItem,
  PurchaseItemInput,
  StockMovement,
  PreparedDish,
  Charter,
  Settings,
  Alert,
  PrepareDishInput,
  PrepareDishResult,
  DatabaseSnapshot,
  User,
} from "../domain/types";
import { buildSeed } from "../domain/seed";
import {
  weightedAverageCost,
  computeDeductions,
  computeAlerts,
} from "../domain/stock";
import { uid } from "../utils";

const DB_KEY = "nomad-stock:db:v1";
const USER_KEY = "nomad-stock:user:v1";

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/**
 * localStorage-backed repository with an in-memory cache.
 * All operations are synchronous internally but exposed as async to match
 * the Repo contract (and the future Supabase impl).
 */
export class DemoRepo implements Repo {
  readonly mode = "demo" as const;
  private db: DatabaseSnapshot;
  private listeners = new Set<() => void>();

  constructor() {
    this.db = this.load();
  }

  private load(): DatabaseSnapshot {
    if (hasStorage()) {
      const raw = window.localStorage.getItem(DB_KEY);
      if (raw) {
        try {
          return JSON.parse(raw) as DatabaseSnapshot;
        } catch {
          // fall through to seed
        }
      }
    }
    const seed = buildSeed();
    this.persistSnapshot(seed);
    return seed;
  }

  private persistSnapshot(db: DatabaseSnapshot) {
    if (hasStorage()) {
      window.localStorage.setItem(DB_KEY, JSON.stringify(db));
    }
  }

  private persist() {
    this.persistSnapshot(this.db);
  }

  private product(id: string): Product | undefined {
    return this.db.products.find((p) => p.id === id);
  }

  private addMovement(m: Omit<StockMovement, "id" | "createdAt" | "createdBy"> & {
    createdBy?: string;
    createdAt?: string;
  }) {
    this.db.movements.push({
      id: uid("mv-"),
      createdAt: m.createdAt ?? new Date().toISOString(),
      createdBy: m.createdBy ?? this.currentUserName(),
      ...m,
    } as StockMovement);
  }

  private currentUserName(): string {
    if (hasStorage()) {
      const raw = window.localStorage.getItem(USER_KEY);
      if (raw) {
        try {
          return (JSON.parse(raw) as User).name;
        } catch {
          /* ignore */
        }
      }
    }
    return "Usuario demo";
  }

  // ---- Products ----
  async listProducts(): Promise<Product[]> {
    return clone(this.db.products);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const p = this.product(id);
    return p ? clone(p) : undefined;
  }

  async upsertProduct(product: Product): Promise<Product> {
    const idx = this.db.products.findIndex((p) => p.id === product.id);
    const stamped = { ...product, updatedAt: new Date().toISOString() };
    if (idx >= 0) {
      this.db.products[idx] = stamped;
    } else {
      this.db.products.push({
        ...stamped,
        id: product.id || uid("prod-"),
        createdAt: new Date().toISOString(),
      });
    }
    this.commit();
    return clone(stamped);
  }

  async deleteProduct(id: string): Promise<void> {
    this.db.products = this.db.products.filter((p) => p.id !== id);
    this.commit();
  }

  async adjustStock(input: AdjustStockInput): Promise<void> {
    const p = this.product(input.productId);
    if (!p) return;
    p.currentQuantity = round(p.currentQuantity + input.delta);
    p.updatedAt = new Date().toISOString();
    this.addMovement({
      productId: p.id,
      movementType: input.type,
      quantity: input.delta,
      unit: p.unit,
      costAmount: Math.abs(input.delta) * p.averageUnitCost,
      notes: input.notes,
    });
    this.commit();
  }

  // ---- Purchases ----
  async listPurchases(): Promise<Purchase[]> {
    return clone(this.db.purchases).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }

  async registerPurchase(input: {
    date: string;
    supplier?: string;
    notes?: string;
    items: PurchaseItemInput[];
  }): Promise<Purchase> {
    const items: PurchaseItem[] = [];
    let total = 0;
    for (const raw of input.items) {
      const prod = this.product(raw.productId);
      if (!prod) continue;
      const unitPrice = raw.quantity > 0 ? raw.totalPrice / raw.quantity : 0;
      // weighted average cost update
      prod.averageUnitCost = weightedAverageCost(
        prod.currentQuantity,
        prod.averageUnitCost,
        raw.quantity,
        unitPrice
      );
      prod.currentQuantity = round(prod.currentQuantity + raw.quantity);
      prod.updatedAt = new Date().toISOString();
      total += raw.totalPrice;
      items.push({
        id: uid("pi-"),
        productId: raw.productId,
        quantity: raw.quantity,
        unit: raw.unit,
        totalPrice: raw.totalPrice,
        unitPrice: round(unitPrice, 4),
      });
      this.addMovement({
        productId: raw.productId,
        movementType: "compra",
        quantity: raw.quantity,
        unit: raw.unit,
        costAmount: raw.totalPrice,
        notes: input.supplier ? `Compra a ${input.supplier}` : "Compra",
      });
    }
    const purchase: Purchase = {
      id: uid("buy-"),
      date: input.date,
      supplier: input.supplier,
      totalAmount: round(total),
      notes: input.notes,
      createdBy: this.currentUserName(),
      items,
    };
    this.db.purchases.push(purchase);
    this.commit();
    return clone(purchase);
  }

  // ---- Recipes ----
  async listRecipes(): Promise<Recipe[]> {
    return clone(this.db.recipes);
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    const r = this.db.recipes.find((x) => x.id === id);
    return r ? clone(r) : undefined;
  }

  async upsertRecipe(recipe: Recipe): Promise<Recipe> {
    const idx = this.db.recipes.findIndex((r) => r.id === recipe.id);
    const stamped = { ...recipe, updatedAt: new Date().toISOString() };
    if (idx >= 0) {
      this.db.recipes[idx] = stamped;
    } else {
      this.db.recipes.push({
        ...stamped,
        id: recipe.id || uid("rec-"),
        createdAt: new Date().toISOString(),
      });
    }
    this.commit();
    return clone(stamped);
  }

  async duplicateRecipe(id: string): Promise<Recipe> {
    const r = this.db.recipes.find((x) => x.id === id);
    if (!r) throw new Error("Receta no encontrada");
    const copy: Recipe = {
      ...clone(r),
      id: uid("rec-"),
      name: `${r.name} (copia)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.db.recipes.push(copy);
    this.commit();
    return clone(copy);
  }

  async deleteRecipe(id: string): Promise<void> {
    this.db.recipes = this.db.recipes.filter((r) => r.id !== id);
    this.commit();
  }

  // ---- Prepare dishes ----
  async prepareDish(input: PrepareDishInput): Promise<PrepareDishResult> {
    const recipe = this.db.recipes.find((r) => r.id === input.recipeId);
    if (!recipe) return { ok: false };
    const deductions = computeDeductions(recipe, input.servings, this.db.products);

    const shortages = deductions.filter((d) => d.short);
    if (shortages.length > 0 && !this.db.settings.allowNegativeStock) {
      return {
        ok: false,
        shortages: shortages.map((s) => ({
          productId: s.productId,
          productName: s.productName,
          needed: s.needed,
          available: s.available,
          unit: s.unit,
        })),
      };
    }

    const preparedDish: PreparedDish = {
      id: uid("pd-"),
      recipeId: recipe.id,
      recipeName: recipe.name,
      servings: input.servings,
      charterId: input.charterId,
      preparedBy: this.currentUserName(),
      preparedAt: new Date().toISOString(),
      totalCost: round(deductions.reduce((s, d) => s + d.cost, 0)),
    };

    for (const d of deductions) {
      const prod = this.product(d.productId);
      if (!prod) continue;
      prod.currentQuantity = round(prod.currentQuantity - d.needed);
      prod.updatedAt = new Date().toISOString();
      this.addMovement({
        productId: d.productId,
        movementType: "preparacion",
        quantity: -d.needed,
        unit: d.unit,
        costAmount: d.cost,
        charterId: input.charterId,
        recipeId: recipe.id,
        preparedDishId: preparedDish.id,
        notes: `${input.servings} porción(es) de ${recipe.name}`,
      });
    }
    this.db.preparedDishes.push(preparedDish);
    this.commit();
    return { ok: true, preparedDish: clone(preparedDish) };
  }

  async listPreparedDishes(): Promise<PreparedDish[]> {
    return clone(this.db.preparedDishes).sort((a, b) =>
      b.preparedAt.localeCompare(a.preparedAt)
    );
  }

  // ---- Beverages ----
  async consumeBeverage(productId: string, qty: number, charterId?: string): Promise<void> {
    const p = this.product(productId);
    if (!p) return;
    p.currentQuantity = round(p.currentQuantity - qty);
    p.updatedAt = new Date().toISOString();
    this.addMovement({
      productId,
      movementType: "consumo_bebida",
      quantity: -qty,
      unit: p.unit,
      costAmount: qty * p.averageUnitCost,
      charterId: charterId ?? this.db.activeCharterId,
      notes: "Consumo de bebida",
    });
    this.commit();
  }

  async restockBeverage(productId: string, qty: number): Promise<void> {
    const p = this.product(productId);
    if (!p) return;
    p.currentQuantity = round(p.currentQuantity + qty);
    p.updatedAt = new Date().toISOString();
    this.addMovement({
      productId,
      movementType: "devolucion",
      quantity: qty,
      unit: p.unit,
      costAmount: qty * p.averageUnitCost,
      notes: "Reposición de bebida",
    });
    this.commit();
  }

  async setBeverageStock(productId: string, qty: number): Promise<void> {
    const p = this.product(productId);
    if (!p) return;
    const delta = qty - p.currentQuantity;
    p.currentQuantity = round(qty);
    p.updatedAt = new Date().toISOString();
    this.addMovement({
      productId,
      movementType: "ajuste",
      quantity: delta,
      unit: p.unit,
      costAmount: Math.abs(delta) * p.averageUnitCost,
      notes: "Carga de stock inicial",
    });
    this.commit();
  }

  // ---- Movements ----
  async listMovements(filter?: MovementFilter): Promise<StockMovement[]> {
    let list = clone(this.db.movements);
    if (filter?.productId) list = list.filter((m) => m.productId === filter.productId);
    if (filter?.charterId) list = list.filter((m) => m.charterId === filter.charterId);
    if (filter?.type) list = list.filter((m) => m.movementType === filter.type);
    if (filter?.from) list = list.filter((m) => m.createdAt >= filter.from!);
    if (filter?.to) list = list.filter((m) => m.createdAt <= filter.to!);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ---- Charters ----
  async listCharters(): Promise<Charter[]> {
    return clone(this.db.charters);
  }

  async upsertCharter(charter: Charter): Promise<Charter> {
    const idx = this.db.charters.findIndex((c) => c.id === charter.id);
    if (idx >= 0) this.db.charters[idx] = charter;
    else this.db.charters.push({ ...charter, id: charter.id || uid("charter-") });
    this.commit();
    return clone(charter);
  }

  async deleteCharter(id: string): Promise<void> {
    this.db.charters = this.db.charters.filter((c) => c.id !== id);
    if (this.db.activeCharterId === id) this.db.activeCharterId = undefined;
    this.commit();
  }

  async getActiveCharter(): Promise<Charter | undefined> {
    if (!this.db.activeCharterId) return undefined;
    const c = this.db.charters.find((x) => x.id === this.db.activeCharterId);
    return c ? clone(c) : undefined;
  }

  async setActiveCharter(id: string | undefined): Promise<void> {
    this.db.activeCharterId = id;
    this.commit();
  }

  // ---- Settings ----
  async getSettings(): Promise<Settings> {
    return clone(this.db.settings);
  }

  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    this.db.settings = { ...this.db.settings, ...settings };
    this.commit();
    return clone(this.db.settings);
  }

  // ---- Alerts ----
  async computeAlerts(): Promise<Alert[]> {
    return computeAlerts(
      this.db.products,
      this.db.recipes,
      this.db.settings,
      this.db.charters,
      this.db.movements,
      this.db.activeCharterId
    );
  }

  // ---- Auth ----
  async getCurrentUser(): Promise<User | null> {
    if (!hasStorage()) return null;
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  async setCurrentUser(user: User | null): Promise<void> {
    if (!hasStorage()) return;
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_KEY);
  }

  // ---- Demo utilities ----
  async resetDemo(): Promise<void> {
    this.db = buildSeed();
    this.persist();
    this.emit();
  }

  // ---- internal ----
  private commit() {
    this.persist();
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * f) / f;
}

import type { Repo, MovementFilter, AdjustStockInput } from "./Repo";
import type {
  Product,
  Recipe,
  Purchase,
  PurchaseItemInput,
  StockMovement,
  PreparedDish,
  Charter,
  Settings,
  Alert,
  PrepareDishInput,
  PrepareDishResult,
  User,
  RecipeItem,
} from "../domain/types";
import {
  weightedAverageCost,
  computeDeductions,
  computeAlerts,
} from "../domain/stock";
import { getSupabaseBrowserClient } from "../supabase/client";

// Row shapes from Supabase are loosely typed; `any` is intentional at the mapper boundary.
// --- row mappers (snake_case DB <-> camelCase domain) ---
function toProduct(r: any): Product {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    unit: r.unit,
    currentQuantity: Number(r.current_quantity),
    averageUnitCost: Number(r.average_unit_cost),
    minimumQuantity: Number(r.minimum_quantity),
    criticalQuantity: Number(r.critical_quantity),
    location: r.location,
    supplier: r.supplier ?? undefined,
    expirationDate: r.expiration_date ?? undefined,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function fromProduct(p: Product): any {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    current_quantity: p.currentQuantity,
    average_unit_cost: p.averageUnitCost,
    minimum_quantity: p.minimumQuantity,
    critical_quantity: p.criticalQuantity,
    location: p.location,
    supplier: p.supplier ?? null,
    expiration_date: p.expirationDate ?? null,
    active: p.active,
    updated_at: new Date().toISOString(),
  };
}
function toRecipe(r: any): Recipe {
  const items: RecipeItem[] = (r.recipe_items ?? []).map((i: any) => ({
    productId: i.product_id,
    quantityPerServing: Number(i.quantity_per_serving),
    unit: i.unit,
  }));
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    category: r.category ?? undefined,
    imageUrl: r.image_url ?? undefined,
    icon: r.icon ?? undefined,
    active: r.active,
    items,
    prepNotes: r.prep_notes ?? undefined,
    referencePrice: r.reference_price ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function toMovement(r: any): StockMovement {
  return {
    id: r.id,
    productId: r.product_id,
    movementType: r.movement_type,
    quantity: Number(r.quantity),
    unit: r.unit,
    costAmount: Number(r.cost_amount),
    charterId: r.charter_id ?? undefined,
    recipeId: r.recipe_id ?? undefined,
    preparedDishId: r.prepared_dish_id ?? undefined,
    notes: r.notes ?? undefined,
    createdBy: r.created_by ?? "—",
    createdAt: r.created_at,
  };
}
function toCharter(r: any): Charter {
  return {
    id: r.id,
    code: r.code,
    customerName: r.customer_name ?? undefined,
    startDate: r.start_date ?? undefined,
    endDate: r.end_date ?? undefined,
    guestCount: r.guest_count ?? undefined,
    boat: r.boat ?? undefined,
    status: r.status,
    notes: r.notes ?? undefined,
  };
}

/**
 * Supabase-backed repository. Orchestrates multi-step operations client-side
 * reusing the pure domain logic (same source of truth as the demo repo).
 * For strict atomicity you can move register_purchase / prepare_dish to the
 * SQL RPCs shipped in supabase/migrations/0001_init.sql.
 */
export class SupabaseRepo implements Repo {
  readonly mode = "supabase" as const;
  private sb = getSupabaseBrowserClient();

  private userName = "Usuario";

  private async me(): Promise<string> {
    const u = await this.getCurrentUser();
    return u?.name ?? this.userName;
  }

  async listProducts(): Promise<Product[]> {
    const { data, error } = await this.sb.from("products").select("*").order("name");
    if (error) throw error;
    return (data ?? []).map(toProduct);
  }
  async getProduct(id: string): Promise<Product | undefined> {
    const { data } = await this.sb.from("products").select("*").eq("id", id).maybeSingle();
    return data ? toProduct(data) : undefined;
  }
  async upsertProduct(product: Product): Promise<Product> {
    const { data, error } = await this.sb
      .from("products")
      .upsert(fromProduct(product))
      .select("*")
      .single();
    if (error) throw error;
    return toProduct(data);
  }
  async deleteProduct(id: string): Promise<void> {
    await this.sb.from("products").delete().eq("id", id);
  }
  async adjustStock(input: AdjustStockInput): Promise<void> {
    const p = await this.getProduct(input.productId);
    if (!p) return;
    await this.sb
      .from("products")
      .update({ current_quantity: p.currentQuantity + input.delta, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    await this.sb.from("stock_movements").insert({
      product_id: p.id,
      movement_type: input.type,
      quantity: input.delta,
      unit: p.unit,
      cost_amount: Math.abs(input.delta) * p.averageUnitCost,
      notes: input.notes ?? null,
      created_by: await this.me(),
    });
  }

  async listPurchases(): Promise<Purchase[]> {
    const { data } = await this.sb
      .from("purchases")
      .select("*, purchase_items(*)")
      .order("date", { ascending: false });
    return (data ?? []).map((r: any) => ({
      id: r.id,
      date: r.date,
      supplier: r.supplier ?? undefined,
      totalAmount: Number(r.total_amount),
      notes: r.notes ?? undefined,
      createdBy: r.created_by ?? "—",
      items: (r.purchase_items ?? []).map((i: any) => ({
        id: i.id,
        productId: i.product_id,
        quantity: Number(i.quantity),
        unit: i.unit,
        totalPrice: Number(i.total_price),
        unitPrice: Number(i.unit_price),
      })),
    }));
  }

  async registerPurchase(input: {
    date: string;
    supplier?: string;
    notes?: string;
    items: PurchaseItemInput[];
  }): Promise<Purchase> {
    const me = await this.me();
    let total = 0;
    const { data: purchase, error } = await this.sb
      .from("purchases")
      .insert({ date: input.date, supplier: input.supplier ?? null, notes: input.notes ?? null, total_amount: 0, created_by: me })
      .select("*")
      .single();
    if (error) throw error;

    for (const raw of input.items) {
      const p = await this.getProduct(raw.productId);
      if (!p) continue;
      const unitPrice = raw.quantity > 0 ? raw.totalPrice / raw.quantity : 0;
      const newCost = weightedAverageCost(p.currentQuantity, p.averageUnitCost, raw.quantity, unitPrice);
      total += raw.totalPrice;
      await this.sb.from("products").update({
        average_unit_cost: newCost,
        current_quantity: p.currentQuantity + raw.quantity,
        updated_at: new Date().toISOString(),
      }).eq("id", p.id);
      await this.sb.from("purchase_items").insert({
        purchase_id: purchase.id,
        product_id: raw.productId,
        quantity: raw.quantity,
        unit: raw.unit,
        total_price: raw.totalPrice,
        unit_price: unitPrice,
      });
      await this.sb.from("stock_movements").insert({
        product_id: raw.productId,
        movement_type: "compra",
        quantity: raw.quantity,
        unit: raw.unit,
        cost_amount: raw.totalPrice,
        notes: input.supplier ? `Compra a ${input.supplier}` : "Compra",
        created_by: me,
      });
    }
    await this.sb.from("purchases").update({ total_amount: total }).eq("id", purchase.id);
    return (await this.listPurchases()).find((x) => x.id === purchase.id)!;
  }

  async listRecipes(): Promise<Recipe[]> {
    const { data } = await this.sb.from("recipes").select("*, recipe_items(*)").order("name");
    return (data ?? []).map(toRecipe);
  }
  async getRecipe(id: string): Promise<Recipe | undefined> {
    const { data } = await this.sb.from("recipes").select("*, recipe_items(*)").eq("id", id).maybeSingle();
    return data ? toRecipe(data) : undefined;
  }
  async upsertRecipe(recipe: Recipe): Promise<Recipe> {
    const { data, error } = await this.sb.from("recipes").upsert({
      id: recipe.id,
      name: recipe.name,
      description: recipe.description ?? null,
      category: recipe.category ?? null,
      image_url: recipe.imageUrl ?? null,
      icon: recipe.icon ?? null,
      active: recipe.active,
      prep_notes: recipe.prepNotes ?? null,
      reference_price: recipe.referencePrice ?? null,
      updated_at: new Date().toISOString(),
    }).select("*").single();
    if (error) throw error;
    await this.sb.from("recipe_items").delete().eq("recipe_id", data.id);
    if (recipe.items.length) {
      await this.sb.from("recipe_items").insert(
        recipe.items.map((i) => ({
          recipe_id: data.id,
          product_id: i.productId,
          quantity_per_serving: i.quantityPerServing,
          unit: i.unit,
        }))
      );
    }
    return (await this.getRecipe(data.id))!;
  }
  async duplicateRecipe(id: string): Promise<Recipe> {
    const r = await this.getRecipe(id);
    if (!r) throw new Error("Receta no encontrada");
    const copy: Recipe = { ...r, id: crypto.randomUUID(), name: `${r.name} (copia)` };
    return this.upsertRecipe(copy);
  }
  async deleteRecipe(id: string): Promise<void> {
    await this.sb.from("recipes").delete().eq("id", id);
  }

  async prepareDish(input: PrepareDishInput): Promise<PrepareDishResult> {
    const recipe = await this.getRecipe(input.recipeId);
    if (!recipe) return { ok: false };
    const products = await this.listProducts();
    const settings = await this.getSettings();
    const deductions = computeDeductions(recipe, input.servings, products);
    const shortages = deductions.filter((d) => d.short);
    if (shortages.length && !settings.allowNegativeStock) {
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
    const me = await this.me();
    const totalCost = deductions.reduce((s, d) => s + d.cost, 0);
    const { data: pd, error } = await this.sb.from("prepared_dishes").insert({
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      servings: input.servings,
      charter_id: input.charterId ?? null,
      prepared_by: me,
      total_cost: totalCost,
    }).select("*").single();
    if (error) throw error;

    const byId = new Map(products.map((p) => [p.id, p]));
    for (const d of deductions) {
      const p = byId.get(d.productId);
      if (!p) continue;
      await this.sb.from("products").update({
        current_quantity: p.currentQuantity - d.needed,
        updated_at: new Date().toISOString(),
      }).eq("id", p.id);
      await this.sb.from("stock_movements").insert({
        product_id: d.productId,
        movement_type: "preparacion",
        quantity: -d.needed,
        unit: d.unit,
        cost_amount: d.cost,
        charter_id: input.charterId ?? null,
        recipe_id: recipe.id,
        prepared_dish_id: pd.id,
        notes: `${input.servings} porción(es) de ${recipe.name}`,
        created_by: me,
      });
    }
    return {
      ok: true,
      preparedDish: {
        id: pd.id,
        recipeId: recipe.id,
        recipeName: recipe.name,
        servings: input.servings,
        charterId: input.charterId,
        preparedBy: me,
        preparedAt: pd.prepared_at,
        totalCost,
      },
    };
  }

  async listPreparedDishes(): Promise<PreparedDish[]> {
    const { data } = await this.sb.from("prepared_dishes").select("*").order("prepared_at", { ascending: false });
    return (data ?? []).map((r: any) => ({
      id: r.id,
      recipeId: r.recipe_id,
      recipeName: r.recipe_name,
      servings: r.servings,
      charterId: r.charter_id ?? undefined,
      preparedBy: r.prepared_by ?? "—",
      preparedAt: r.prepared_at,
      totalCost: Number(r.total_cost),
    }));
  }

  async consumeBeverage(productId: string, qty: number, charterId?: string): Promise<void> {
    const p = await this.getProduct(productId);
    if (!p) return;
    const active = await this.getActiveCharter();
    await this.sb.from("products").update({ current_quantity: p.currentQuantity - qty, updated_at: new Date().toISOString() }).eq("id", p.id);
    await this.sb.from("stock_movements").insert({
      product_id: productId,
      movement_type: "consumo_bebida",
      quantity: -qty,
      unit: p.unit,
      cost_amount: qty * p.averageUnitCost,
      charter_id: charterId ?? active?.id ?? null,
      notes: "Consumo de bebida",
      created_by: await this.me(),
    });
  }
  async restockBeverage(productId: string, qty: number): Promise<void> {
    await this.adjustStock({ productId, delta: qty, type: "devolucion", notes: "Reposición de bebida" });
  }
  async setBeverageStock(productId: string, qty: number): Promise<void> {
    const p = await this.getProduct(productId);
    if (!p) return;
    await this.adjustStock({ productId, delta: qty - p.currentQuantity, type: "ajuste", notes: "Carga de stock inicial" });
  }

  async listMovements(filter?: MovementFilter): Promise<StockMovement[]> {
    let q = this.sb.from("stock_movements").select("*").order("created_at", { ascending: false });
    if (filter?.productId) q = q.eq("product_id", filter.productId);
    if (filter?.charterId) q = q.eq("charter_id", filter.charterId);
    if (filter?.type) q = q.eq("movement_type", filter.type);
    if (filter?.from) q = q.gte("created_at", filter.from);
    if (filter?.to) q = q.lte("created_at", filter.to);
    const { data } = await q;
    return (data ?? []).map(toMovement);
  }

  async listCharters(): Promise<Charter[]> {
    const { data } = await this.sb.from("charters").select("*").order("start_date", { ascending: false });
    return (data ?? []).map(toCharter);
  }
  async upsertCharter(charter: Charter): Promise<Charter> {
    const { data, error } = await this.sb.from("charters").upsert({
      id: charter.id || undefined,
      code: charter.code,
      customer_name: charter.customerName ?? null,
      start_date: charter.startDate ?? null,
      end_date: charter.endDate ?? null,
      guest_count: charter.guestCount ?? null,
      boat: charter.boat ?? null,
      status: charter.status,
      notes: charter.notes ?? null,
    }).select("*").single();
    if (error) throw error;
    return toCharter(data);
  }
  async deleteCharter(id: string): Promise<void> {
    await this.sb.from("charters").delete().eq("id", id);
  }
  async getActiveCharter(): Promise<Charter | undefined> {
    const { data } = await this.sb.from("charters").select("*").eq("is_active", true).maybeSingle();
    return data ? toCharter(data) : undefined;
  }
  async setActiveCharter(id: string | undefined): Promise<void> {
    await this.sb.from("charters").update({ is_active: false }).eq("is_active", true);
    if (id) await this.sb.from("charters").update({ is_active: true }).eq("id", id);
  }

  async getSettings(): Promise<Settings> {
    const { data } = await this.sb.from("settings").select("*").eq("id", 1).maybeSingle();
    return {
      currency: data?.currency ?? "USD",
      allowNegativeStock: data?.allow_negative_stock ?? false,
      expiryWarningDays: data?.expiry_warning_days ?? 5,
    };
  }
  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    const current = await this.getSettings();
    const merged = { ...current, ...settings };
    await this.sb.from("settings").upsert({
      id: 1,
      currency: merged.currency,
      allow_negative_stock: merged.allowNegativeStock,
      expiry_warning_days: merged.expiryWarningDays,
    });
    return merged;
  }

  async computeAlerts(): Promise<Alert[]> {
    const [products, recipes, settings, charters, movements, active] = await Promise.all([
      this.listProducts(),
      this.listRecipes(),
      this.getSettings(),
      this.listCharters(),
      this.listMovements(),
      this.getActiveCharter(),
    ]);
    return computeAlerts(products, recipes, settings, charters, movements, active?.id);
  }

  async getCurrentUser(): Promise<User | null> {
    const { data: auth } = await this.sb.auth.getUser();
    if (!auth?.user) return null;
    const { data: profile } = await this.sb
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .maybeSingle();
    return {
      id: auth.user.id,
      email: auth.user.email ?? undefined,
      name: profile?.name ?? auth.user.email ?? "Usuario",
      role: profile?.role ?? "lectura",
    };
  }
  async setCurrentUser(): Promise<void> {
    // With Supabase, the user comes from the auth session — no-op here.
  }
}

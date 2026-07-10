// Domain types for Nomad Stock. These mirror the Supabase schema
// (supabase/migrations/0001_init.sql) and are used by both the demo repo
// (localStorage) and the Supabase repo.

export type Role = "admin" | "cocinero" | "lectura";

export interface User {
  id: string;
  name: string;
  email?: string;
  role: Role;
}

export type Unit =
  | "g"
  | "kg"
  | "ml"
  | "l"
  | "unidad"
  | "botella"
  | "lata"
  | "pack";

export type StockLocation =
  | "cocina"
  | "heladera"
  | "freezer"
  | "deposito"
  | "bar"
  | "otro";

export type CategoryKey =
  | "carnes"
  | "pescados"
  | "verduras"
  | "frutas"
  | "secos"
  | "lacteos"
  | "condimentos"
  | "bebidas"
  | "limpieza";

export interface Category {
  key: CategoryKey;
  label: string;
  icon: string; // lucide icon name
}

export type StockStatus = "normal" | "bajo" | "critico";

export interface Product {
  id: string;
  name: string;
  category: CategoryKey;
  unit: Unit;
  currentQuantity: number;
  averageUnitCost: number; // cost per `unit`
  minimumQuantity: number;
  criticalQuantity: number;
  location: StockLocation;
  supplier?: string;
  expirationDate?: string; // ISO date
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeItem {
  productId: string;
  quantityPerServing: number;
  unit: Unit;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  icon?: string; // emoji or lucide name for quick visual
  active: boolean;
  items: RecipeItem[];
  prepNotes?: string;
  referencePrice?: number;
  createdAt: string;
  updatedAt: string;
}

export type MovementType =
  | "compra"
  | "preparacion"
  | "consumo_bebida"
  | "ajuste"
  | "merma"
  | "devolucion"
  | "correccion"
  | "transferencia";

export interface StockMovement {
  id: string;
  productId: string;
  movementType: MovementType;
  quantity: number; // positive = entra, negative = sale
  unit: Unit;
  costAmount: number;
  charterId?: string;
  recipeId?: string;
  preparedDishId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unit: Unit;
  totalPrice: number;
}

export interface PurchaseItem extends PurchaseItemInput {
  id: string;
  unitPrice: number;
}

export interface Purchase {
  id: string;
  date: string;
  supplier?: string;
  totalAmount: number;
  notes?: string;
  createdBy: string;
  items: PurchaseItem[];
}

export interface PreparedDish {
  id: string;
  recipeId: string;
  recipeName: string;
  servings: number;
  charterId?: string;
  preparedBy: string;
  preparedAt: string;
  totalCost: number;
}

export type CharterStatus = "proximo" | "activo" | "finalizado";

export interface Charter {
  id: string;
  code: string;
  customerName?: string;
  startDate?: string;
  endDate?: string;
  guestCount?: number;
  boat?: string;
  status: CharterStatus;
  notes?: string;
}

export interface Settings {
  currency: string;
  allowNegativeStock: boolean;
  expiryWarningDays: number;
}

export type AlertLevel = "info" | "warning" | "critical";
export type AlertKind =
  | "stock_bajo"
  | "stock_critico"
  | "vencido"
  | "por_vencer"
  | "sin_costo"
  | "receta_sin_stock"
  | "stock_negativo"
  | "charter_sin_consumo"
  | "receta_incompleta";

export interface Alert {
  id: string;
  kind: AlertKind;
  level: AlertLevel;
  title: string;
  detail: string;
  productId?: string;
  recipeId?: string;
  charterId?: string;
}

// --- input payloads ---

export interface PrepareDishInput {
  recipeId: string;
  servings: number;
  charterId?: string;
}

export interface PrepareDishResult {
  ok: boolean;
  preparedDish?: PreparedDish;
  shortages?: { productId: string; productName: string; needed: number; available: number; unit: Unit }[];
}

export interface DatabaseSnapshot {
  products: Product[];
  recipes: Recipe[];
  purchases: Purchase[];
  movements: StockMovement[];
  preparedDishes: PreparedDish[];
  charters: Charter[];
  settings: Settings;
  activeCharterId?: string;
}

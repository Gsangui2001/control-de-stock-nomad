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
  MovementType,
  User,
} from "../domain/types";

export interface MovementFilter {
  productId?: string;
  charterId?: string;
  type?: MovementType;
  from?: string;
  to?: string;
}

export interface AdjustStockInput {
  productId: string;
  /** signed delta applied to current quantity */
  delta: number;
  type: Extract<MovementType, "ajuste" | "merma" | "devolucion" | "correccion" | "transferencia">;
  notes?: string;
}

/**
 * Single contract shared by the demo (localStorage) and Supabase implementations.
 * All methods are async so both backends share the same call sites.
 */
export interface Repo {
  readonly mode: "demo" | "supabase";

  // Products
  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  upsertProduct(product: Product): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  adjustStock(input: AdjustStockInput): Promise<void>;

  // Purchases
  listPurchases(): Promise<Purchase[]>;
  registerPurchase(input: {
    date: string;
    supplier?: string;
    notes?: string;
    items: PurchaseItemInput[];
  }): Promise<Purchase>;

  // Recipes
  listRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | undefined>;
  upsertRecipe(recipe: Recipe): Promise<Recipe>;
  duplicateRecipe(id: string): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;

  // Prepare dishes
  prepareDish(input: PrepareDishInput): Promise<PrepareDishResult>;
  listPreparedDishes(): Promise<PreparedDish[]>;

  // Beverages (products in category "bebidas" — thin helpers)
  consumeBeverage(productId: string, qty: number, charterId?: string): Promise<void>;
  restockBeverage(productId: string, qty: number): Promise<void>;
  setBeverageStock(productId: string, qty: number): Promise<void>;

  // Movements
  listMovements(filter?: MovementFilter): Promise<StockMovement[]>;

  // Charters
  listCharters(): Promise<Charter[]>;
  upsertCharter(charter: Charter): Promise<Charter>;
  deleteCharter(id: string): Promise<void>;
  getActiveCharter(): Promise<Charter | undefined>;
  setActiveCharter(id: string | undefined): Promise<void>;

  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(settings: Partial<Settings>): Promise<Settings>;

  // Alerts (derived)
  computeAlerts(): Promise<Alert[]>;

  // Auth / current user
  getCurrentUser(): Promise<User | null>;
  setCurrentUser(user: User | null): Promise<void>;

  // Demo utilities
  resetDemo?(): Promise<void>;
}

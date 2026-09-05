import type { Boat, Expense, ExpenseCategoryKey, ExpenseInput, User } from "../domain/types";

export interface ExpenseFilter {
  boatId?: string;
  category?: ExpenseCategoryKey;
  from?: string; // "YYYY-MM-DD"
  to?: string;
}

/**
 * Single contract shared by the demo (localStorage) and Supabase implementations.
 * All methods are async so both backends share the same call sites.
 */
export interface Repo {
  readonly mode: "demo" | "supabase";

  // Boats — de solo lectura: el catálogo real vive en el CRM.
  listBoats(): Promise<Boat[]>;

  // Expenses
  listExpenses(filter?: ExpenseFilter): Promise<Expense[]>;
  createExpense(input: ExpenseInput): Promise<Expense>;
  updateExpense(id: string, input: Partial<ExpenseInput>): Promise<Expense>;
  /** Solo un admin borra — un gestor corrige editando. */
  deleteExpense(id: string): Promise<void>;

  // Auth / current user
  getCurrentUser(): Promise<User | null>;
  /** Fija el usuario actual (solo modo demo). */
  setCurrentUser(user: User | null): Promise<void>;
  /** Login con email/contraseña (solo modo Supabase). */
  signIn(email: string, password: string): Promise<{ error?: string }>;
  /** Registro (solo modo Supabase). */
  signUp(email: string, password: string, name: string): Promise<{ error?: string }>;
  /** Cierra la sesión. */
  signOut(): Promise<void>;

  // Demo utilities
  resetDemo?(): Promise<void>;
}

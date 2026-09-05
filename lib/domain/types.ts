// Domain types for NOMADE — administrador de gastos de flota. Mirroran el esquema de Supabase
// (supabase/README.md apunta a la migración real, que vive en el repo del CRM) y los usan tanto el
// repo demo (localStorage) como el repo Supabase.

export type Role = "admin" | "gestor";

export interface User {
  id: string;
  name: string;
  email?: string;
  role: Role;
}

/** Un barco, de solo lectura acá: el catálogo real (tarifas, fotos, flota) vive en el CRM. */
export interface Boat {
  id: string;
  name: string;
}

export type ExpenseCategoryKey =
  | "mantenimiento"
  | "combustible"
  | "amarre_marina_permisos"
  | "otros_operativos";

export interface ExpenseCategory {
  key: ExpenseCategoryKey;
  label: string;
  icon: string; // lucide icon name
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { key: "mantenimiento", label: "Mantenimiento y reparaciones", icon: "Wrench" },
  { key: "combustible", label: "Combustible", icon: "Fuel" },
  { key: "amarre_marina_permisos", label: "Amarre, marina y permisos", icon: "Anchor" },
  { key: "otros_operativos", label: "Otros gastos operativos", icon: "Package" },
];

export function categoryLabel(key: ExpenseCategoryKey): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

/** Monto siempre en USD — no hay columna de moneda, ni acá ni en la base. */
export interface Expense {
  id: string;
  boatId: string;
  category: ExpenseCategoryKey;
  amountUsd: number;
  expenseDate: string; // "YYYY-MM-DD"
  vendor?: string;
  description?: string;
  /** Data-URL de un JPEG comprimido en el cliente (ver lib/imageUtils.ts). */
  receiptImageUrl?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseInput {
  boatId: string;
  category: ExpenseCategoryKey;
  amountUsd: number;
  expenseDate: string;
  vendor?: string;
  description?: string;
  receiptImageUrl?: string;
}

export interface DatabaseSnapshot {
  boats: Boat[];
  expenses: Expense[];
}

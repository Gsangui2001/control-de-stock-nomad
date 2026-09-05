// Funciones puras y testeables sobre gastos — sin I/O, mismo estilo que ya usaba stock.ts.

import type { Expense, ExpenseCategoryKey } from "./types";

export function totalAmount(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amountUsd, 0);
}

export function filterByDateRange(expenses: Expense[], from?: string, to?: string): Expense[] {
  return expenses.filter((e) => {
    if (from && e.expenseDate < from) return false;
    if (to && e.expenseDate > to) return false;
    return true;
  });
}

export interface CategoryTotal {
  category: ExpenseCategoryKey;
  total: number;
  count: number;
}

/** Total y cantidad de gastos por categoría, ordenado de mayor a menor monto. */
export function totalsByCategory(expenses: Expense[]): CategoryTotal[] {
  const byCategory = new Map<ExpenseCategoryKey, CategoryTotal>();
  for (const e of expenses) {
    const entry = byCategory.get(e.category) ?? { category: e.category, total: 0, count: 0 };
    entry.total += e.amountUsd;
    entry.count += 1;
    byCategory.set(e.category, entry);
  }
  return Array.from(byCategory.values()).sort((a, b) => b.total - a.total);
}

export interface BoatTotal {
  boatId: string;
  total: number;
  count: number;
}

/** Total y cantidad de gastos por barco, ordenado de mayor a menor monto. */
export function totalsByBoat(expenses: Expense[]): BoatTotal[] {
  const byBoat = new Map<string, BoatTotal>();
  for (const e of expenses) {
    const entry = byBoat.get(e.boatId) ?? { boatId: e.boatId, total: 0, count: 0 };
    entry.total += e.amountUsd;
    entry.count += 1;
    byBoat.set(e.boatId, entry);
  }
  return Array.from(byBoat.values()).sort((a, b) => b.total - a.total);
}

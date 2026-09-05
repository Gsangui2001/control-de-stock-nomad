import type { Boat, DatabaseSnapshot, Expense } from "./types";

const now = new Date();
const iso = (offsetDays = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
};
const dateOnly = (offsetDays = 0) => iso(offsetDays).slice(0, 10);

function e(
  id: string,
  boatId: string,
  category: Expense["category"],
  amountUsd: number,
  offsetDays: number,
  extra: Partial<Expense> = {}
): Expense {
  return {
    id,
    boatId,
    category,
    amountUsd,
    expenseDate: dateOnly(offsetDays),
    createdBy: "Boris",
    createdAt: iso(offsetDays),
    updatedAt: iso(offsetDays),
    ...extra,
  };
}

const BOATS: Boat[] = [{ id: "boat-nomade", name: "Nomade" }];

const EXPENSES: Expense[] = [
  e("exp-1", "boat-nomade", "combustible", 320, -12, { vendor: "Estación Balboa" }),
  e("exp-2", "boat-nomade", "mantenimiento", 850, -7, {
    vendor: "Taller Náutico Panamá",
    description: "Cambio de aceite y filtros",
  }),
  e("exp-3", "boat-nomade", "amarre_marina_permisos", 450, -3, { vendor: "Marina Linton" }),
  e("exp-4", "boat-nomade", "otros_operativos", 120, -1, { description: "Insumos de limpieza" }),
];

export function buildSeed(): DatabaseSnapshot {
  return {
    boats: BOATS,
    expenses: EXPENSES,
  };
}

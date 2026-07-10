import type { Unit, Category, CategoryKey, StockLocation, MovementType } from "./types";

export const UNITS: Unit[] = [
  "g",
  "kg",
  "ml",
  "l",
  "unidad",
  "botella",
  "lata",
  "pack",
];

export const UNIT_LABEL: Record<Unit, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "L",
  unidad: "unidad",
  botella: "botella",
  lata: "lata",
  pack: "pack",
};

export const CATEGORIES: Category[] = [
  { key: "carnes", label: "Carnes", icon: "Beef" },
  { key: "pescados", label: "Pescados", icon: "Fish" },
  { key: "verduras", label: "Verduras", icon: "Carrot" },
  { key: "frutas", label: "Frutas", icon: "Apple" },
  { key: "secos", label: "Secos", icon: "Wheat" },
  { key: "lacteos", label: "Lácteos", icon: "Milk" },
  { key: "condimentos", label: "Condimentos", icon: "SaltShaker" },
  { key: "bebidas", label: "Bebidas", icon: "Wine" },
  { key: "limpieza", label: "Limpieza / otros", icon: "SprayCan" },
];

export const CATEGORY_LABEL: Record<CategoryKey, string> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.key]: c.label }),
  {} as Record<CategoryKey, string>
);

export const LOCATIONS: { key: StockLocation; label: string }[] = [
  { key: "cocina", label: "Cocina" },
  { key: "heladera", label: "Heladera" },
  { key: "freezer", label: "Freezer" },
  { key: "deposito", label: "Depósito" },
  { key: "bar", label: "Bar" },
  { key: "otro", label: "Otro" },
];

export const LOCATION_LABEL: Record<StockLocation, string> = LOCATIONS.reduce(
  (acc, l) => ({ ...acc, [l.key]: l.label }),
  {} as Record<StockLocation, string>
);

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  compra: "Compra",
  preparacion: "Preparación de plato",
  consumo_bebida: "Consumo de bebida",
  ajuste: "Ajuste manual",
  merma: "Merma / desperdicio",
  devolucion: "Devolución",
  correccion: "Corrección",
  transferencia: "Transferencia",
};

// Beverage units that are counted per-container (not weight/volume based)
export const COUNT_UNITS: Unit[] = ["unidad", "botella", "lata", "pack"];

export function isCountUnit(unit: Unit): boolean {
  return COUNT_UNITS.includes(unit);
}

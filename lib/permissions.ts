import type { Role } from "./domain/types";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  cocinero: "Cocinero / Operario",
  lectura: "Solo lectura",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Ve y edita todo: compras, insumos, recetas, costos, reportes y usuarios.",
  cocinero: "Prepara platos, registra bebidas y ve el stock. No edita costos ni recetas.",
  lectura: "Solo consulta stock y reportes. No modifica datos.",
};

/** Can this role mutate data at all? */
export function canWrite(role: Role | undefined): boolean {
  return role === "admin" || role === "cocinero";
}

/** Admin-only actions: edit products/recipes/costs, purchases, settings, users. */
export function canManage(role: Role | undefined): boolean {
  return role === "admin";
}

/** Operator actions: prepare dishes, consume beverages. */
export function canOperate(role: Role | undefined): boolean {
  return role === "admin" || role === "cocinero";
}

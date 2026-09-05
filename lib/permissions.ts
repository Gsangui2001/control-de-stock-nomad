import type { Role } from "./domain/types";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  gestor: "Gestor",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Ve y edita todo: gastos, barcos y reportes. Es el único que puede borrar un gasto.",
  gestor: "Carga y edita gastos de cualquier barco. No borra ni administra el catálogo de barcos.",
};

/** ¿Puede cargar o editar un gasto? */
export function canWrite(role: Role | undefined): boolean {
  return role === "admin" || role === "gestor";
}

/** Acciones de admin: borrar un gasto, administrar barcos. */
export function canManage(role: Role | undefined): boolean {
  return role === "admin";
}

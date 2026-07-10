import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number, currency = "USD"): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatQty(qty: number): string {
  const rounded = Math.round((qty + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function uid(prefix = ""): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

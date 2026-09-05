import type { Repo, ExpenseFilter } from "./Repo";
import type { DatabaseSnapshot, Expense, ExpenseInput, User } from "../domain/types";
import { buildSeed } from "../domain/seed";
import { uid } from "../utils";

const DB_KEY = "nomade-gastos:db:v1";
const USER_KEY = "nomade-gastos:user:v1";

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/**
 * localStorage-backed repository with an in-memory cache.
 * All operations are synchronous internally but exposed as async to match
 * the Repo contract (and the Supabase impl).
 */
export class DemoRepo implements Repo {
  readonly mode = "demo" as const;
  private db: DatabaseSnapshot;
  private listeners = new Set<() => void>();

  constructor() {
    this.db = this.load();
  }

  private load(): DatabaseSnapshot {
    if (hasStorage()) {
      const raw = window.localStorage.getItem(DB_KEY);
      if (raw) {
        try {
          return JSON.parse(raw) as DatabaseSnapshot;
        } catch {
          // fall through to seed
        }
      }
    }
    const seed = buildSeed();
    this.persistSnapshot(seed);
    return seed;
  }

  private persistSnapshot(db: DatabaseSnapshot) {
    if (hasStorage()) {
      window.localStorage.setItem(DB_KEY, JSON.stringify(db));
    }
  }

  private persist() {
    this.persistSnapshot(this.db);
  }

  private currentUserName(): string {
    if (hasStorage()) {
      const raw = window.localStorage.getItem(USER_KEY);
      if (raw) {
        try {
          return (JSON.parse(raw) as User).name;
        } catch {
          /* ignore */
        }
      }
    }
    return "Usuario demo";
  }

  // ---- Boats ----
  async listBoats() {
    return clone(this.db.boats);
  }

  // ---- Expenses ----
  async listExpenses(filter?: ExpenseFilter): Promise<Expense[]> {
    let list = clone(this.db.expenses);
    if (filter?.boatId) list = list.filter((e) => e.boatId === filter.boatId);
    if (filter?.category) list = list.filter((e) => e.category === filter.category);
    if (filter?.from) list = list.filter((e) => e.expenseDate >= filter.from!);
    if (filter?.to) list = list.filter((e) => e.expenseDate <= filter.to!);
    return list.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  }

  async createExpense(input: ExpenseInput): Promise<Expense> {
    const now = new Date().toISOString();
    const expense: Expense = {
      id: uid("exp-"),
      ...input,
      createdBy: this.currentUserName(),
      createdAt: now,
      updatedAt: now,
    };
    this.db.expenses.push(expense);
    this.commit();
    return clone(expense);
  }

  async updateExpense(id: string, input: Partial<ExpenseInput>): Promise<Expense> {
    const idx = this.db.expenses.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error("Gasto no encontrado");
    const stamped: Expense = {
      ...this.db.expenses[idx],
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.db.expenses[idx] = stamped;
    this.commit();
    return clone(stamped);
  }

  async deleteExpense(id: string): Promise<void> {
    this.db.expenses = this.db.expenses.filter((e) => e.id !== id);
    this.commit();
  }

  // ---- Auth ----
  async getCurrentUser(): Promise<User | null> {
    if (!hasStorage()) return null;
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  async setCurrentUser(user: User | null): Promise<void> {
    if (!hasStorage()) return;
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_KEY);
  }

  async signIn(): Promise<{ error?: string }> {
    return { error: "En modo demo entrá con el selector de rol." };
  }

  async signUp(): Promise<{ error?: string }> {
    return { error: "En modo demo entrá con el selector de rol." };
  }

  async signOut(): Promise<void> {
    await this.setCurrentUser(null);
  }

  // ---- Demo utilities ----
  async resetDemo(): Promise<void> {
    this.db = buildSeed();
    this.persist();
    this.emit();
  }

  // ---- internal ----
  private commit() {
    this.persist();
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

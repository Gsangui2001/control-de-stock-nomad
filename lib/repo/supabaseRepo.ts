import type { Repo, ExpenseFilter } from "./Repo";
import type { Boat, Expense, ExpenseInput, Role, User } from "../domain/types";
import { getSupabaseBrowserClient } from "../supabase/client";

// Row shapes from Supabase are loosely typed; `any` is intentional at the mapper boundary.
function toExpense(r: any): Expense {
  return {
    id: r.id,
    boatId: r.boat_id,
    category: r.category,
    amountUsd: Number(r.amount_usd),
    expenseDate: r.expense_date,
    vendor: r.vendor ?? undefined,
    description: r.description ?? undefined,
    receiptImageUrl: r.receipt_image_url ?? undefined,
    createdBy: r.created_by ?? "—",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toBoat(r: any): Boat {
  return { id: r.id, name: r.name };
}

/**
 * Repositorio sobre Supabase — el mismo proyecto que usa el CRM, en tablas propias y aisladas
 * (`boat_expense_users`, `boat_expenses`) más una lectura de `public.boats` (ver docs/111 del CRM
 * y la migración `20260905130000_gastos_de_flota_nomade.sql`).
 */
export class SupabaseRepo implements Repo {
  readonly mode = "supabase" as const;
  private sb = getSupabaseBrowserClient();

  // ---- Boats (solo lectura) ----
  async listBoats(): Promise<Boat[]> {
    const { data, error } = await this.sb.from("boats").select("id, name").order("name");
    if (error) throw error;
    return (data ?? []).map(toBoat);
  }

  // ---- Expenses ----
  async listExpenses(filter?: ExpenseFilter): Promise<Expense[]> {
    let q = this.sb.from("boat_expenses").select("*").order("expense_date", { ascending: false });
    if (filter?.boatId) q = q.eq("boat_id", filter.boatId);
    if (filter?.category) q = q.eq("category", filter.category);
    if (filter?.from) q = q.gte("expense_date", filter.from);
    if (filter?.to) q = q.lte("expense_date", filter.to);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(toExpense);
  }

  async createExpense(input: ExpenseInput): Promise<Expense> {
    const { data: auth } = await this.sb.auth.getUser();
    if (!auth?.user) throw new Error("No hay sesión activa");
    const { data, error } = await this.sb
      .from("boat_expenses")
      .insert({
        boat_id: input.boatId,
        category: input.category,
        amount_usd: input.amountUsd,
        expense_date: input.expenseDate,
        vendor: input.vendor ?? null,
        description: input.description ?? null,
        receipt_image_url: input.receiptImageUrl ?? null,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toExpense(data);
  }

  async updateExpense(id: string, input: Partial<ExpenseInput>): Promise<Expense> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.boatId !== undefined) patch.boat_id = input.boatId;
    if (input.category !== undefined) patch.category = input.category;
    if (input.amountUsd !== undefined) patch.amount_usd = input.amountUsd;
    if (input.expenseDate !== undefined) patch.expense_date = input.expenseDate;
    if (input.vendor !== undefined) patch.vendor = input.vendor ?? null;
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.receiptImageUrl !== undefined) patch.receipt_image_url = input.receiptImageUrl ?? null;

    const { data, error } = await this.sb
      .from("boat_expenses")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return toExpense(data);
  }

  async deleteExpense(id: string): Promise<void> {
    const { error } = await this.sb.from("boat_expenses").delete().eq("id", id);
    if (error) throw error;
  }

  // ---- Auth ----

  /**
   * Trae el perfil de `boat_expense_users`; si el usuario ya tiene sesión pero todavía no tiene
   * fila (primer login después de confirmar el email), la crea acá con rol 'gestor' por default —
   * el alta real de un admin la hace otro admin desde el SQL Editor, como documenta docs/111.
   */
  async getCurrentUser(): Promise<User | null> {
    const { data: auth } = await this.sb.auth.getUser();
    if (!auth?.user) return null;

    const { data: existing } = await this.sb
      .from("boat_expense_users")
      .select("*")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (existing) {
      return {
        id: auth.user.id,
        email: auth.user.email ?? undefined,
        name: existing.name || auth.user.email || "Usuario",
        role: existing.role as Role,
      };
    }

    const name = (auth.user.user_metadata?.name as string | undefined) || auth.user.email || "Usuario";
    const { data: created, error } = await this.sb
      .from("boat_expense_users")
      .insert({ id: auth.user.id, name, email: auth.user.email ?? null })
      .select("*")
      .single();
    if (error) {
      // Alguien más ya lo creó entre el select y el insert, o falta el alta manual — no rompe la app.
      return { id: auth.user.id, email: auth.user.email ?? undefined, name, role: "gestor" };
    }
    return {
      id: auth.user.id,
      email: auth.user.email ?? undefined,
      name: created.name || name,
      role: created.role as Role,
    };
  }

  async setCurrentUser(): Promise<void> {
    // Con Supabase el usuario viene de la sesión — no hace nada acá.
  }

  async signIn(email: string, password: string): Promise<{ error?: string }> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  }

  async signUp(email: string, password: string, name: string): Promise<{ error?: string }> {
    const { error } = await this.sb.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    return error ? { error: error.message } : {};
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }
}

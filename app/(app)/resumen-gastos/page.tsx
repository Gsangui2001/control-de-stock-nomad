"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Receipt, Wrench, Fuel, Anchor, Package } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useBoats, useExpenses } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { totalAmount, totalsByCategory, filterByDateRange } from "@/lib/domain/expenses";
import { categoryLabel } from "@/lib/domain/types";
import type { ExpenseCategoryKey } from "@/lib/domain/types";
import { formatMoney } from "@/lib/utils";
import { PageContainer, DemoBanner, EmptyState } from "@/components/app/common";
import { StatCard } from "@/components/app/StatCard";

const CATEGORY_ICON: Record<ExpenseCategoryKey, typeof Wrench> = {
  mantenimiento: Wrench,
  combustible: Fuel,
  amarre_marina_permisos: Anchor,
  otros_operativos: Package,
};

function monthRange(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

export default function DashboardPage() {
  const { user } = useRepoContext();
  const { data: boats } = useBoats();
  const { data: expenses } = useExpenses();

  const { from, to } = monthRange();
  const thisMonth = useMemo(() => filterByDateRange(expenses, from, to), [expenses, from, to]);
  const monthTotal = totalAmount(thisMonth);
  const categoryTotals = useMemo(() => totalsByCategory(thisMonth), [thisMonth]);
  const recent = expenses.slice(0, 5);

  function boatName(id: string) {
    return boats.find((b) => b.id === id)?.name ?? "—";
  }

  return (
    <PageContainer>
      <DemoBanner />

      <div>
        <h1 className="text-[26px] font-bold tracking-tight">
          Hola{user ? `, ${user.name.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5 first-letter:uppercase">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Hero: gasto del mes */}
      <Link href="/reportes" className="block">
        <div className="rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/85 text-primary-foreground p-5 shadow-lifted transition-transform active:scale-[0.99]">
          <span className="text-xs font-semibold uppercase tracking-wider opacity-80">
            Gasto de este mes
          </span>
          <div className="text-4xl font-bold tabular-nums mt-2">{formatMoney(monthTotal)}</div>
          <div className="text-xs opacity-80 mt-1">
            {thisMonth.length} gasto{thisMonth.length !== 1 ? "s" : ""} cargado
            {thisMonth.length !== 1 ? "s" : ""}
          </div>
        </div>
      </Link>

      {/* Por categoría */}
      {categoryTotals.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {categoryTotals.map((c) => (
            <StatCard
              key={c.category}
              label={categoryLabel(c.category)}
              value={formatMoney(c.total)}
              sub={`${c.count} gasto${c.count !== 1 ? "s" : ""}`}
              icon={CATEGORY_ICON[c.category]}
              href="/gastos"
            />
          ))}
        </div>
      )}

      {/* Últimos gastos */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-base font-semibold">Últimos gastos</h2>
          <Link href="/gastos" className="text-xs text-primary font-medium">
            Ver todos
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title="Sin gastos todavía"
            description="Cargá el primer gasto del barco desde Gastos."
          />
        ) : (
          <div className="space-y-2.5">
            {recent.map((e) => {
              const Icon = CATEGORY_ICON[e.category];
              return (
                <Link key={e.id} href="/gastos" className="block">
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft transition-all hover:shadow-lifted active:scale-[0.99]">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {e.vendor || categoryLabel(e.category)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {boatName(e.boatId)} ·{" "}
                          {format(new Date(`${e.expenseDate}T00:00:00`), "dd MMM", { locale: es })}
                        </div>
                      </div>
                    </div>
                    <div className="font-bold shrink-0">{formatMoney(e.amountUsd)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useBoats, useExpenses } from "@/lib/hooks";
import { totalAmount, totalsByCategory, filterByDateRange } from "@/lib/domain/expenses";
import { categoryLabel } from "@/lib/domain/types";
import { formatMoney } from "@/lib/utils";
import { toCSV, downloadCSV } from "@/lib/csv";
import { PageContainer, PageTitle, DemoBanner } from "@/components/app/common";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CHART_COLORS = ["#0f5ba8", "#26b2b2", "#e0a53a", "#3aa76d"];

function monthRange(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

export default function ReportesPage() {
  const { data: boats } = useBoats();
  const { data: expenses } = useExpenses();
  const defaults = monthRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const filtered = useMemo(() => filterByDateRange(expenses, from, to), [expenses, from, to]);
  const total = totalAmount(filtered);
  const byCategory = useMemo(
    () =>
      totalsByCategory(filtered).map((c) => ({
        name: categoryLabel(c.category),
        value: c.total,
        count: c.count,
      })),
    [filtered]
  );

  function boatName(id: string) {
    return boats.find((b) => b.id === id)?.name ?? id;
  }

  function exportCSV() {
    const rows = filtered.map((e) => ({
      fecha: e.expenseDate,
      barco: boatName(e.boatId),
      categoria: categoryLabel(e.category),
      monto_usd: e.amountUsd.toFixed(2),
      proveedor: e.vendor ?? "",
      descripcion: e.description ?? "",
      cargado_por: e.createdBy,
    }));
    downloadCSV("gastos.csv", toCSV(rows));
  }

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle title="Reportes" subtitle="Gastos por período y categoría" />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="from">Desde</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">Hasta</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-muted-foreground">Total del período</div>
              <div className="text-2xl font-bold">{formatMoney(total)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {filtered.length} gasto{filtered.length !== 1 ? "s" : ""}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={exportCSV}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>

          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sin gastos en este período.
            </p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {byCategory.length > 0 && (
        <div className="space-y-1.5">
          {byCategory.map((c) => (
            <div key={c.name} className="flex items-center justify-between text-sm px-1">
              <span>
                {c.name} <span className="text-muted-foreground">· {c.count}</span>
              </span>
              <span className="font-semibold tabular-nums">{formatMoney(c.value)}</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="text-xs text-muted-foreground mb-2">
          {filtered.length} gasto{filtered.length !== 1 ? "s" : ""} entre{" "}
          {format(new Date(`${from}T00:00:00`), "dd MMM", { locale: es })} y{" "}
          {format(new Date(`${to}T00:00:00`), "dd MMM yyyy", { locale: es })}
        </div>
      </div>
    </PageContainer>
  );
}

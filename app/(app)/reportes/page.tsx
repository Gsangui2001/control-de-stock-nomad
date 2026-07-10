"use client";

import { useMemo } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Download, BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from "recharts";
import { useProducts, useMovements, usePreparedDishes, usePurchases, useCharters, useAlerts } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { productValue } from "@/lib/domain/stock";
import { CATEGORY_LABEL } from "@/lib/domain/units";
import { formatMoney } from "@/lib/utils";
import { toCSV, downloadCSV } from "@/lib/csv";
import { PageContainer, PageTitle, DemoBanner } from "@/components/app/common";
import { AlertList } from "@/components/app/AlertList";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

const CHART_COLORS = ["#0f5ba8", "#26b2b2", "#e0a53a", "#3aa76d", "#a3547c", "#5b7fa3", "#c96f4a", "#7a8b3a", "#8a6bd8"];

export default function ReportesPage() {
  const { settings } = useRepoContext();
  const { data: products } = useProducts();
  const { data: movements } = useMovements();
  const { data: prepared } = usePreparedDishes();
  const { data: purchases } = usePurchases();
  const { data: charters } = useCharters();
  const { data: alerts } = useAlerts();
  const cur = settings.currency;

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  // Stock by category
  const stockByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.category, (map.get(p.category) ?? 0) + productValue(p));
    }
    return Array.from(map.entries())
      .map(([k, v]) => ({ name: CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL] ?? k, value: Math.round(v) }))
      .sort((a, b) => b.value - a.value);
  }, [products]);

  const totalStock = stockByCat.reduce((s, c) => s + c.value, 0);

  // Consumption last 7 days
  const consumption7 = useMemo(() => {
    const days = Array.from({ length: 7 }).map((_, i) => startOfDay(subDays(new Date(), 6 - i)));
    return days.map((d) => {
      const next = new Date(d.getTime() + 86400000);
      const dayMovs = movements.filter((m) => {
        const t = new Date(m.createdAt);
        return t >= d && t < next && (m.movementType === "preparacion" || m.movementType === "consumo_bebida");
      });
      return {
        name: format(d, "EEE", { locale: es }),
        comida: Math.round(dayMovs.filter((m) => m.movementType === "preparacion").reduce((s, m) => s + m.costAmount, 0)),
        bebida: Math.round(dayMovs.filter((m) => m.movementType === "consumo_bebida").reduce((s, m) => s + m.costAmount, 0)),
      };
    });
  }, [movements]);

  // Most prepared dishes
  const topDishes = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const p of prepared) {
      const cur = map.get(p.recipeId) ?? { name: p.recipeName, count: 0 };
      cur.count += p.servings;
      map.set(p.recipeId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [prepared]);

  // Charter consumption
  const [charterId, setCharterId] = useState<string>(charters[0]?.id ?? "");
  const charterReport = useMemo(() => {
    const movs = movements.filter((m) => m.charterId === charterId);
    const comida = movs.filter((m) => m.movementType === "preparacion").reduce((s, m) => s + m.costAmount, 0);
    const bebida = movs.filter((m) => m.movementType === "consumo_bebida").reduce((s, m) => s + m.costAmount, 0);
    const platos = prepared.filter((p) => p.charterId === charterId);
    const servings = platos.reduce((s, p) => s + p.servings, 0);
    const charter = charters.find((c) => c.id === charterId);
    const perPerson = charter?.guestCount ? (comida + bebida) / charter.guestCount : 0;
    return { comida, bebida, servings, platos: platos.length, perPerson, charter };
  }, [charterId, movements, prepared, charters]);

  function exportStock() {
    const csv = toCSV(
      products.map((p) => ({
        producto: p.name,
        categoria: CATEGORY_LABEL[p.category],
        cantidad: p.currentQuantity,
        unidad: p.unit,
        costo_unitario: p.averageUnitCost,
        valor: productValue(p).toFixed(2),
        minimo: p.minimumQuantity,
        critico: p.criticalQuantity,
      }))
    );
    downloadCSV("stock.csv", csv);
  }

  function exportMovements() {
    const csv = toCSV(
      movements.map((m) => ({
        fecha: m.createdAt,
        producto: productName(m.productId),
        tipo: m.movementType,
        cantidad: m.quantity,
        unidad: m.unit,
        costo: m.costAmount.toFixed(2),
        charter: m.charterId ?? "",
        usuario: m.createdBy,
        notas: m.notes ?? "",
      }))
    );
    downloadCSV("movimientos.csv", csv);
  }

  function exportPurchases() {
    const rows = purchases.flatMap((pu) =>
      pu.items.map((it) => ({
        fecha: pu.date,
        proveedor: pu.supplier ?? "",
        producto: productName(it.productId),
        cantidad: it.quantity,
        unidad: it.unit,
        precio_total: it.totalPrice,
        precio_unitario: it.unitPrice,
      }))
    );
    downloadCSV("compras.csv", toCSV(rows));
  }

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle title="Reportes" subtitle="Stock, consumo y charters" />

      <Tabs defaultValue="stock">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="consumo">Consumo</TabsTrigger>
          <TabsTrigger value="charter">Charter</TabsTrigger>
          <TabsTrigger value="alertas">Alertas</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs text-muted-foreground">Valor total del stock</div>
                  <div className="text-2xl font-bold">{formatMoney(totalStock, cur)}</div>
                </div>
                <Button size="sm" variant="outline" onClick={exportStock}>
                  <Download className="h-4 w-4" /> CSV
                </Button>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stockByCat} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => formatMoney(v, cur)} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {stockByCat.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consumo" className="space-y-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">Consumo (últimos 7 días)</div>
                <Button size="sm" variant="outline" onClick={exportMovements}>
                  <Download className="h-4 w-4" /> CSV
                </Button>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={consumption7} margin={{ left: -10, right: 10 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => formatMoney(v, cur)} />
                    <Line type="monotone" dataKey="comida" stroke="#0f5ba8" strokeWidth={2} />
                    <Line type="monotone" dataKey="bebida" stroke="#26b2b2" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold mb-2">Platos más preparados</div>
              {topDishes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos todavía.</p>
              ) : (
                <div className="space-y-1.5">
                  {topDishes.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-sm">
                      <span>{d.name}</span>
                      <span className="font-semibold tabular-nums">{d.count} porc.</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full" onClick={exportPurchases}>
            <Download className="h-4 w-4" /> Exportar compras (CSV)
          </Button>
        </TabsContent>

        <TabsContent value="charter" className="space-y-3">
          <Select value={charterId} onValueChange={setCharterId}>
            <SelectTrigger><SelectValue placeholder="Elegí un charter" /></SelectTrigger>
            <SelectContent>
              {charters.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {charterReport.charter ? (
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Costo comida" value={formatMoney(charterReport.comida, cur)} />
              <MiniStat label="Costo bebida" value={formatMoney(charterReport.bebida, cur)} />
              <MiniStat label="Platos preparados" value={`${charterReport.servings} porc.`} />
              <MiniStat label="Costo / persona" value={formatMoney(charterReport.perPerson, cur)} />
              <div className="col-span-2">
                <MiniStat
                  label="Total consumido"
                  value={formatMoney(charterReport.comida + charterReport.bebida, cur)}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Elegí un charter para ver el reporte.</p>
          )}
        </TabsContent>

        <TabsContent value="alertas" className="space-y-3">
          <AlertList alerts={alerts} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </Card>
  );
}

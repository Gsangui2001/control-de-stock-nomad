"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Plus, Trash2, ShoppingCart, Receipt } from "lucide-react";
import { useProducts, usePurchases } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { canManage } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";
import type { PurchaseItemInput } from "@/lib/domain/types";
import {
  PageContainer,
  PageTitle,
  EmptyState,
  DemoBanner,
} from "@/components/app/common";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface Row {
  productId: string;
  quantity: number;
  totalPrice: number;
}

export default function ComprasPage() {
  const { data: products } = useProducts();
  const { data: purchases } = usePurchases();
  const { repo, refresh, user, settings } = useRepoContext();
  const manage = canManage(user?.role);

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "";
  const productUnit = (id: string) => products.find((p) => p.id === id)?.unit ?? "";

  function addRow() {
    if (!products.length) {
      toast.error("Primero creá productos en Stock");
      return;
    }
    setRows([...rows, { productId: products[0].id, quantity: 1, totalPrice: 0 }]);
  }
  function updateRow(i: number, patch: Partial<Row>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows(rows.filter((_, idx) => idx !== i));
  }

  const total = rows.reduce((s, r) => s + (Number(r.totalPrice) || 0), 0);

  async function submit() {
    const items: PurchaseItemInput[] = rows
      .filter((r) => r.quantity > 0)
      .map((r) => ({
        productId: r.productId,
        quantity: Number(r.quantity),
        unit: productUnit(r.productId) as PurchaseItemInput["unit"],
        totalPrice: Number(r.totalPrice) || 0,
      }));
    if (items.length === 0) {
      toast.error("Agregá al menos un producto");
      return;
    }
    await repo.registerPurchase({ date, supplier: supplier || undefined, notes: notes || undefined, items });
    refresh();
    toast.success("Compra cargada", { description: "Stock y costos actualizados" });
    setOpen(false);
    setRows([]);
    setSupplier("");
    setNotes("");
  }

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle
        title="Compras"
        subtitle={`${purchases.length} compras cargadas`}
        action={
          manage ? (
            <Button size="icon" aria-label="Nueva compra" onClick={() => { setOpen(true); if (rows.length === 0) addRow(); }}>
              <Plus className="h-5 w-5" />
            </Button>
          ) : undefined
        }
      />

      {!manage && (
        <p className="text-sm text-muted-foreground">Solo un admin puede cargar compras.</p>
      )}

      {purchases.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-8 w-8" />}
          title="Sin compras"
          description="Cargá tu primera compra para sumar stock."
          action={manage ? <Button onClick={() => { setOpen(true); addRow(); }}>Cargar compra</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {purchases.map((pu) => (
            <Card key={pu.id} className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    {pu.supplier || "Compra"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(pu.date), "dd MMM yyyy", { locale: es })} · {pu.items.length} ítems
                  </div>
                </div>
                <div className="text-lg font-bold">{formatMoney(pu.totalAmount, settings.currency)}</div>
              </div>
              <div className="mt-2 space-y-1">
                {pu.items.map((it) => (
                  <div key={it.id} className="flex justify-between text-xs text-muted-foreground">
                    <span>{productName(it.productId)} · {it.quantity} {it.unit}</span>
                    <span>{formatMoney(it.totalPrice, settings.currency)} ({formatMoney(it.unitPrice, settings.currency)}/{it.unit})</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Nueva compra</SheetTitle>
          </SheetHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="date">Fecha</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier">Proveedor</Label>
                <Input id="supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Opcional" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Productos</Label>
                <Button size="sm" variant="outline" onClick={addRow}>
                  <Plus className="h-4 w-4" /> Ítem
                </Button>
              </div>
              {rows.map((r, i) => {
                const unitPrice = r.quantity > 0 ? (Number(r.totalPrice) || 0) / r.quantity : 0;
                return (
                  <Card key={i} className="p-2.5">
                    <div className="flex items-center gap-2 mb-2">
                      <Select value={r.productId} onValueChange={(v) => updateRow(i, { productId: v })}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" onClick={() => removeRow(i)} aria-label="Quitar">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Cantidad ({productUnit(r.productId)})</Label>
                        <Input type="number" step="any" value={r.quantity} onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label className="text-xs">Precio total</Label>
                        <Input type="number" step="any" value={r.totalPrice} onChange={(e) => updateRow(i, { totalPrice: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      = {formatMoney(unitPrice, settings.currency)} / {productUnit(r.productId)}
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pnotes">Notas</Label>
              <Textarea id="pnotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="text-muted-foreground">Total</span>
              <span className="text-xl font-bold">{formatMoney(total, settings.currency)}</span>
            </div>

            <Button size="xl" className="w-full" onClick={submit}>
              Cargar compra
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}

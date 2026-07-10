"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Wine, Plus, Minus, Check } from "lucide-react";
import { useProducts } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { stockStatus } from "@/lib/domain/stock";
import type { Product } from "@/lib/domain/types";
import { canOperate } from "@/lib/permissions";
import { formatQty } from "@/lib/utils";
import {
  PageContainer,
  PageTitle,
  EmptyState,
  ListSkeleton,
  DemoBanner,
} from "@/components/app/common";
import { QuantityStepper } from "@/components/app/QuantityStepper";
import { StockStatusBadge } from "@/components/app/StockStatusBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function BebidasPage() {
  const { data: products, loading } = useProducts();
  const { repo, refresh, user, activeCharter } = useRepoContext();
  const [multi, setMulti] = useState<Product | null>(null);
  const [multiQty, setMultiQty] = useState(1);
  const [stockDialog, setStockDialog] = useState<Product | null>(null);
  const [stockValue, setStockValue] = useState(0);

  const beverages = useMemo(
    () => products.filter((p) => p.category === "bebidas").sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  );
  const canOp = canOperate(user?.role);

  async function quickConsume(p: Product, qty: number) {
    await repo.consumeBeverage(p.id, qty, activeCharter?.id);
    refresh();
    toast.success(`−${qty} ${p.name}`, {
      description: activeCharter ? `Charter ${activeCharter.code}` : undefined,
    });
  }

  async function quickRestock(p: Product, qty: number) {
    await repo.restockBeverage(p.id, qty);
    refresh();
    toast.success(`+${qty} ${p.name}`);
  }

  async function confirmMulti() {
    if (!multi) return;
    await quickConsume(multi, multiQty);
    setMulti(null);
    setMultiQty(1);
  }

  async function confirmSetStock() {
    if (!stockDialog) return;
    await repo.setBeverageStock(stockDialog.id, stockValue);
    refresh();
    toast.success(`Stock de ${stockDialog.name}: ${stockValue}`);
    setStockDialog(null);
  }

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle
        title="Bebidas"
        subtitle={activeCharter ? `Charter ${activeCharter.code}` : "Consumo y reposición"}
      />

      {loading ? (
        <ListSkeleton />
      ) : beverages.length === 0 ? (
        <EmptyState
          icon={<Wine className="h-8 w-8" />}
          title="Sin bebidas"
          description="Agregá bebidas desde Stock (categoría Bebidas)."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {beverages.map((b) => (
            <Card key={b.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.unit}</div>
                </div>
                <StockStatusBadge status={stockStatus(b)} />
              </div>

              <div className="flex items-center justify-between gap-3 mb-3">
                <Button
                  variant="outline"
                  className="h-16 w-16 rounded-2xl shrink-0"
                  disabled={!canOp}
                  onClick={() => quickConsume(b, 1)}
                  aria-label="Consumir uno"
                >
                  <Minus className="!h-8 !w-8" />
                </Button>
                <div className="text-center">
                  <div className="text-5xl font-bold tabular-nums leading-none">
                    {formatQty(b.currentQuantity)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="h-16 w-16 rounded-2xl shrink-0"
                  disabled={!canOp}
                  onClick={() => quickRestock(b, 1)}
                  aria-label="Reponer uno"
                >
                  <Plus className="!h-8 !w-8" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canOp}
                  onClick={() => {
                    setMulti(b);
                    setMultiQty(1);
                  }}
                >
                  Consumo múltiple
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canOp}
                  onClick={() => {
                    setStockDialog(b);
                    setStockValue(b.currentQuantity);
                  }}
                >
                  Cargar stock
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Multi consume */}
      <Dialog open={!!multi} onOpenChange={(v) => !v && setMulti(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consumo · {multi?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <span className="text-sm text-muted-foreground">¿Cuántas se consumieron?</span>
            <QuantityStepper value={multiQty} onChange={setMultiQty} min={1} />
          </div>
          <DialogFooter>
            <Button size="lg" onClick={confirmMulti}>
              <Check className="h-5 w-5" /> Registrar consumo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set initial stock */}
      <Dialog open={!!stockDialog} onOpenChange={(v) => !v && setStockDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stock de heladera · {stockDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="stockval">Cantidad total en {stockDialog?.unit}</Label>
            <Input
              id="stockval"
              type="number"
              step="any"
              value={stockValue}
              onChange={(e) => setStockValue(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <DialogFooter>
            <Button size="lg" onClick={confirmSetStock}>Guardar stock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

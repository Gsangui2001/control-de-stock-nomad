"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Package, SlidersHorizontal, AlertTriangle } from "lucide-react";
import { useProducts } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { stockStatus, productValue } from "@/lib/domain/stock";
import { CATEGORIES, CATEGORY_LABEL, LOCATION_LABEL } from "@/lib/domain/units";
import type { Product, CategoryKey } from "@/lib/domain/types";
import { canManage } from "@/lib/permissions";
import { formatMoney, formatQty } from "@/lib/utils";
import {
  PageContainer,
  PageTitle,
  EmptyState,
  ListSkeleton,
  DemoBanner,
} from "@/components/app/common";
import { StockStatusBadge } from "@/components/app/StockStatusBadge";
import { AdjustStockDialog } from "@/components/stock/AdjustStockDialog";
import { ProductForm } from "@/components/stock/ProductForm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function StockPage() {
  const { data: products, loading } = useProducts();
  const { user, settings } = useRepoContext();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CategoryKey | "all">("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [adjust, setAdjust] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const manage = canManage(user?.role);

  const filtered = useMemo(() => {
    return products
      .filter((p) => (cat === "all" ? true : p.category === cat))
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      .filter((p) => (lowOnly ? stockStatus(p) !== "normal" : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, cat, query, lowOnly]);

  const totalValue = useMemo(
    () => products.reduce((s, p) => s + productValue(p), 0),
    [products]
  );

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle
        title="Stock"
        subtitle={`${products.length} productos · ${formatMoney(totalValue, settings.currency)}`}
        action={
          manage ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="icon" aria-label="Nuevo producto">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nuevo producto</DialogTitle>
                </DialogHeader>
                <ProductForm onDone={() => setCreateOpen(false)} />
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar producto…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        <FilterChip active={cat === "all"} onClick={() => setCat("all")}>
          Todas
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>
            {c.label}
          </FilterChip>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant={lowOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setLowOnly((v) => !v)}
        >
          <AlertTriangle className="h-4 w-4" />
          Solo stock bajo
        </Button>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <SlidersHorizontal className="h-3.5 w-3.5" /> {filtered.length} resultados
        </span>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="Sin productos"
          description="No hay productos que coincidan con el filtro."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const status = stockStatus(p);
            return (
              <Card key={p.id} className="p-3">
                <div className="flex items-center gap-3">
                  <Link href={`/stock/${p.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{p.name}</span>
                      <StockStatusBadge status={status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                      <span>{CATEGORY_LABEL[p.category]}</span>
                      <span>·</span>
                      <span>{LOCATION_LABEL[p.location]}</span>
                      <span>·</span>
                      <span>{formatMoney(productValue(p), settings.currency)}</span>
                    </div>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold tabular-nums leading-none">
                      {formatQty(p.currentQuantity)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{p.unit}</div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setAdjust(p)}>
                      Ajustar
                    </Button>
                    {manage && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                        Editar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AdjustStockDialog
        product={adjust}
        open={!!adjust}
        onOpenChange={(v) => !v && setAdjust(null)}
      />

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar producto</DialogTitle>
          </DialogHeader>
          {editing && <ProductForm product={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-accent/10")
      }
    >
      {children}
    </button>
  );
}

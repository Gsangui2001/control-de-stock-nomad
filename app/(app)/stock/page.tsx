"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Package, SlidersHorizontal, AlertTriangle, Pencil } from "lucide-react";
import { useProducts } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { stockStatus, productValue } from "@/lib/domain/stock";
import { CATEGORIES, LOCATION_LABEL } from "@/lib/domain/units";
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
import { Fab } from "@/components/app/Fab";
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
} from "@/components/ui/dialog";

const CATEGORY_EMOJI: Record<CategoryKey, string> = {
  carnes: "🥩",
  pescados: "🐟",
  verduras: "🥕",
  frutas: "🍎",
  secos: "🌾",
  lacteos: "🥛",
  condimentos: "🧂",
  bebidas: "🍷",
  limpieza: "🧴",
};

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
        subtitle={
          manage
            ? `${products.length} productos · ${formatMoney(totalValue, settings.currency)}`
            : `${products.length} productos`
        }
      />
      {manage && (
        <>
          <Fab label="Producto" onClick={() => setCreateOpen(true)} />
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nuevo producto</DialogTitle>
              </DialogHeader>
              <ProductForm onDone={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </>
      )}

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
        <div className="space-y-2.5">
          {filtered.map((p) => {
            const status = stockStatus(p);
            return (
              <Card key={p.id} className="p-3.5 hover:shadow-lifted transition-all">
                <div className="flex items-center gap-3">
                  <Link href={`/stock/${p.id}`} className="flex flex-1 items-center gap-3 min-w-0">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
                      {CATEGORY_EMOJI[p.category]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{p.name}</div>
                      <div className="flex items-center gap-1.5 mt-1 min-w-0">
                        <StockStatusBadge status={status} />
                        <span className="text-xs text-muted-foreground truncate">
                          {LOCATION_LABEL[p.location]}
                          {manage && ` · ${formatMoney(productValue(p), settings.currency)}`}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold tabular-nums leading-none">
                        {formatQty(p.currentQuantity)}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{p.unit}</div>
                    </div>
                  </Link>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Ajustar ${p.name}`}
                      onClick={() => setAdjust(p)}
                    >
                      <SlidersHorizontal className="h-5 w-5" />
                    </Button>
                    {manage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9"
                        aria-label={`Editar ${p.name}`}
                        onClick={() => setEditing(p)}
                      >
                        <Pencil className="h-4 w-4" />
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

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { useMovements } from "@/lib/hooks";
import type { Product } from "@/lib/domain/types";
import { stockStatus, productValue } from "@/lib/domain/stock";
import { CATEGORY_LABEL, LOCATION_LABEL, MOVEMENT_LABEL } from "@/lib/domain/units";
import { formatMoney, formatQty } from "@/lib/utils";
import { PageContainer, PageTitle, EmptyState, ListSkeleton } from "@/components/app/common";
import { StockStatusBadge } from "@/components/app/StockStatusBadge";
import { AdjustStockDialog } from "@/components/stock/AdjustStockDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const { repo, settings, revision } = useRepoContext();
  const [product, setProduct] = useState<Product | undefined>();
  const [loading, setLoading] = useState(true);
  const [adjust, setAdjust] = useState<Product | null>(null);
  const { data: movements } = useMovements({ productId: params.id });

  useEffect(() => {
    let active = true;
    repo.getProduct(params.id).then((p) => {
      if (active) {
        setProduct(p);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [repo, params.id, revision]);

  if (loading) {
    return (
      <PageContainer>
        <ListSkeleton rows={5} />
      </PageContainer>
    );
  }

  if (!product) {
    return (
      <PageContainer>
        <PageTitle title="Producto" back="/stock" />
        <EmptyState title="Producto no encontrado" />
      </PageContainer>
    );
  }

  const status = stockStatus(product);

  return (
    <PageContainer>
      <PageTitle title={product.name} subtitle={CATEGORY_LABEL[product.category]} back="/stock" />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold tabular-nums">
                {formatQty(product.currentQuantity)}{" "}
                <span className="text-base font-normal text-muted-foreground">{product.unit}</span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {formatMoney(productValue(product), settings.currency)} en stock
              </div>
            </div>
            <StockStatusBadge status={status} />
          </div>

          <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-sm pt-2 border-t">
            <Field label="Costo unitario" value={formatMoney(product.averageUnitCost, settings.currency)} />
            <Field label="Ubicación" value={LOCATION_LABEL[product.location]} />
            <Field label="Stock mínimo" value={`${formatQty(product.minimumQuantity)} ${product.unit}`} />
            <Field label="Stock crítico" value={`${formatQty(product.criticalQuantity)} ${product.unit}`} />
            {product.supplier && <Field label="Proveedor" value={product.supplier} />}
            {product.expirationDate && (
              <Field label="Vence" value={format(new Date(product.expirationDate), "dd MMM yyyy", { locale: es })} />
            )}
          </div>

          <Button size="lg" className="w-full" onClick={() => setAdjust(product)}>
            Ajustar stock
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 mt-2">
          Movimientos ({movements.length})
        </h2>
        {movements.length === 0 ? (
          <EmptyState title="Sin movimientos" description="Todavía no hay movimientos de este producto." />
        ) : (
          <div className="space-y-2">
            {movements.map((m) => (
              <Card key={m.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{MOVEMENT_LABEL[m.movementType]}</Badge>
                      {m.notes && <span className="text-xs text-muted-foreground truncate">{m.notes}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {format(new Date(m.createdAt), "dd MMM HH:mm", { locale: es })} · {m.createdBy}
                    </div>
                  </div>
                  <div
                    className={
                      "text-lg font-bold tabular-nums shrink-0 " +
                      (m.quantity >= 0 ? "text-success" : "text-destructive")
                    }
                  >
                    {m.quantity >= 0 ? "+" : ""}
                    {formatQty(m.quantity)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AdjustStockDialog product={adjust} open={!!adjust} onOpenChange={(v) => !v && setAdjust(null)} />
    </PageContainer>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

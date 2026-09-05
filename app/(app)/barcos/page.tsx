"use client";

import { Ship } from "lucide-react";
import { useBoats, useExpenses } from "@/lib/hooks";
import { totalsByBoat } from "@/lib/domain/expenses";
import { formatMoney } from "@/lib/utils";
import { PageContainer, PageTitle, EmptyState, DemoBanner } from "@/components/app/common";
import { Card } from "@/components/ui/card";

export default function BarcosPage() {
  const { data: boats } = useBoats();
  const { data: expenses } = useExpenses();
  const totals = totalsByBoat(expenses);

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle
        title="Barcos"
        subtitle="Catálogo de solo lectura — se carga y edita desde el CRM"
      />

      {boats.length === 0 ? (
        <EmptyState
          icon={<Ship className="h-8 w-8" />}
          title="Sin barcos"
          description="El catálogo de barcos se carga desde el CRM de Nomad Sailors."
        />
      ) : (
        <div className="space-y-3">
          {boats.map((b) => {
            const total = totals.find((t) => t.boatId === b.id);
            return (
              <Card key={b.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Ship className="h-5 w-5" />
                    </span>
                    <span className="font-semibold truncate">{b.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold">{formatMoney(total?.total ?? 0)}</div>
                    <div className="text-xs text-muted-foreground">
                      {total?.count ?? 0} gasto{(total?.count ?? 0) !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

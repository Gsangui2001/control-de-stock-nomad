import type { StockStatus } from "@/lib/domain/types";
import { Badge } from "@/components/ui/badge";

const MAP: Record<StockStatus, { label: string; variant: "success" | "warning" | "destructive" }> = {
  normal: { label: "Normal", variant: "success" },
  bajo: { label: "Bajo", variant: "warning" },
  critico: { label: "Crítico", variant: "destructive" },
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const { label, variant } = MAP[status];
  return <Badge variant={variant}>{label}</Badge>;
}

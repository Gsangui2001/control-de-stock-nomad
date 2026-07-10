import Link from "next/link";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { Alert, AlertLevel } from "@/lib/domain/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const LEVEL: Record<AlertLevel, { icon: typeof Info; className: string }> = {
  critical: { icon: AlertCircle, className: "text-destructive" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  info: { icon: Info, className: "text-primary" },
};

export function AlertList({ alerts, limit }: { alerts: Alert[]; limit?: number }) {
  const list = limit ? alerts.slice(0, limit) : alerts;
  if (list.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground text-center">
        Todo en orden · sin alertas 🎉
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {list.map((a) => {
        const { icon: Icon, className } = LEVEL[a.level];
        const body = (
          <Card className="p-3">
            <div className="flex items-start gap-2.5">
              <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", className)} />
              <div className="min-w-0">
                <div className="font-medium text-sm leading-tight">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.detail}</div>
              </div>
            </div>
          </Card>
        );
        return a.productId ? (
          <Link key={a.id} href={`/stock/${a.productId}`}>{body}</Link>
        ) : a.recipeId ? (
          <Link key={a.id} href={`/platos/${a.recipeId}`}>{body}</Link>
        ) : (
          <div key={a.id}>{body}</div>
        );
      })}
    </div>
  );
}

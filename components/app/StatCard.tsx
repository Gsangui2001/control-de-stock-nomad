import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "warning" | "critical" | "success";
}) {
  const iconClass = {
    default: "text-primary bg-primary/10",
    warning: "text-warning-foreground bg-warning/15",
    critical: "text-destructive bg-destructive/10",
    success: "text-success bg-success/10",
  }[tone];

  const inner = (
    <Card className={cn("p-4 h-full", href && "hover:shadow-lifted active:scale-[0.99] transition-all")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1.5 leading-tight">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1 truncate">{sub}</div>}
        </div>
        <div className={cn("h-11 w-11 shrink-0 rounded-xl flex items-center justify-center", iconClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );

  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

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
  const toneClass = {
    default: "text-primary bg-primary/10",
    warning: "text-warning bg-warning/10",
    critical: "text-destructive bg-destructive/10",
    success: "text-success bg-success/10",
  }[tone];

  const inner = (
    <Card className="p-4 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold tabular-nums mt-1 leading-tight">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
        </div>
        <div className={cn("h-10 w-10 shrink-0 rounded-xl flex items-center justify-center", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

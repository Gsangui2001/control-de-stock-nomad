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
  const toneConfig = {
    default: {
      bg: "bg-gradient-to-br from-primary/10 to-primary/5",
      icon: "text-primary bg-primary/15",
      border: "border-primary/20",
    },
    warning: {
      bg: "bg-gradient-to-br from-warning/10 to-warning/5",
      icon: "text-warning bg-warning/15",
      border: "border-warning/20",
    },
    critical: {
      bg: "bg-gradient-to-br from-destructive/10 to-destructive/5",
      icon: "text-destructive bg-destructive/15",
      border: "border-destructive/20",
    },
    success: {
      bg: "bg-gradient-to-br from-success/10 to-success/5",
      icon: "text-success bg-success/15",
      border: "border-success/20",
    },
  }[tone];

  const inner = (
    <Card className={cn("p-4 h-full border transition-all hover:shadow-md", toneConfig.bg, toneConfig.border)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{label}</div>
          <div className="text-3xl font-bold tabular-nums mt-2 leading-tight">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{sub}</div>}
        </div>
        <div className={cn("h-12 w-12 shrink-0 rounded-lg flex items-center justify-center", toneConfig.icon)}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </Card>
  );

  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

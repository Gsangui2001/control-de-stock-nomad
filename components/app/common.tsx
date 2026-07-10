"use client";

import Link from "next/link";
import { ChevronLeft, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto max-w-2xl px-4 py-4 space-y-4", className)}>{children}</div>
  );
}

export function PageTitle({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        {back && (
          <Link
            href={back}
            className="mt-0.5 h-8 w-8 shrink-0 rounded-lg border flex items-center justify-center hover:bg-accent/10"
            aria-label="Volver"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center text-center p-8 gap-2 border-dashed">
      {icon && <div className="text-muted-foreground mb-1">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {description && <p className="text-sm text-muted-foreground max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export function DemoBanner() {
  const { mode } = useRepoContext();
  if (mode !== "demo") return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
      <Info className="h-4 w-4 shrink-0 text-warning" />
      <span>
        <strong>Modo demo</strong> · datos de ejemplo guardados en este dispositivo.
        Configurá Supabase para datos reales.
      </span>
    </div>
  );
}

"use client";

import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Floating action button — main action of the screen, always one thumb away.
 * Sits above the bottom nav, respecting the safe area.
 */
export function Fab({
  label,
  icon: Icon = Plus,
  onClick,
  className,
}: {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "fixed right-4 z-40 flex h-14 items-center gap-2 rounded-2xl bg-primary pl-4 pr-5",
        "text-sm font-semibold text-primary-foreground shadow-lifted",
        "transition-all duration-150 hover:brightness-110 active:scale-95",
        "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]",
        className
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

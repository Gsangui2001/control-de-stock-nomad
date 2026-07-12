"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { canManage } from "@/lib/permissions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useRepoContext();
  const [open, setOpen] = useState(false);
  const manage = canManage(user?.role);
  const visible = NAV_ITEMS.filter((i) => (i.adminOnly ? manage : true));
  const primary = visible.filter((i) => i.primary);
  const secondary = visible.filter((i) => !i.primary);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-md safe-bottom">
      <div className="mx-auto max-w-2xl grid grid-cols-5">
        {primary.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-[60px] flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-8 items-center justify-center rounded-full px-4 transition-all duration-200",
                  active ? "bg-primary/10" : "bg-transparent"
                )}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
              </span>
              <span className={cn(active && "font-semibold")}>{item.label}</span>
            </Link>
          );
        })}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="flex min-h-[60px] flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] font-medium text-muted-foreground">
              <span className="flex h-8 items-center justify-center rounded-full px-4">
                <Menu className="h-[22px] w-[22px]" />
              </span>
              Más
            </button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Menú</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-3 pb-4">
              {secondary.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-4 transition-colors",
                      active ? "border-primary bg-primary/5 text-primary" : "hover:bg-accent/10"
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

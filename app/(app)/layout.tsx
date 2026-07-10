"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { BottomNav } from "@/components/app/BottomNav";
import { Anchor } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, user } = useRepoContext();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-12 w-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center animate-pulse">
            <Anchor className="h-6 w-6" />
          </div>
          <span className="text-sm">Cargando…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pb-20">
      <AppHeader />
      <main>{children}</main>
      <BottomNav />
    </div>
  );
}

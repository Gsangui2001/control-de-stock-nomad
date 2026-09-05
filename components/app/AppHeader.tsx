"use client";

import { useRouter } from "next/navigation";
import { Anchor, Moon, Sun, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/permissions";

export function AppHeader() {
  const { user, repo, refresh } = useRepoContext();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function logout() {
    await repo.signOut();
    refresh();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto max-w-2xl flex items-center justify-between gap-2 px-4 h-16">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-soft">
            <Anchor className="h-5 w-5" />
          </div>
          {/* En pantallas chicas manda el selector de charter; la marca vive en el ícono */}
          <div className="hidden sm:block min-w-0 leading-tight">
            <div className="text-sm font-bold whitespace-nowrap">NOMADE</div>
            {user && (
              <div className="text-[11px] text-muted-foreground font-medium truncate">
                {user.name} · {ROLE_LABEL[user.role]}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cambiar tema"
            className="hover:bg-muted/50"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {mounted && theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Salir" className="hover:bg-destructive/10 hover:text-destructive" onClick={logout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

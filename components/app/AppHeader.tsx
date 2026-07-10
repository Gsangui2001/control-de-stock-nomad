"use client";

import { useRouter } from "next/navigation";
import { Anchor, Moon, Sun, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { CharterSwitcher } from "./CharterSwitcher";
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
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm shadow-sm">
      <div className="mx-auto max-w-2xl flex items-center justify-between px-4 h-16">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center shadow-md">
            <Anchor className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold">Nomad Stock</div>
            {user && (
              <div className="text-xs text-muted-foreground font-medium">
                {user.name} · {ROLE_LABEL[user.role]}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <CharterSwitcher />
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

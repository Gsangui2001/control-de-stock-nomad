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
  const { user, setUser } = useRepoContext();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function logout() {
    await setUser(null);
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-2xl flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Anchor className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold">Nomad Stock</div>
            {user && (
              <div className="text-[11px] text-muted-foreground">
                {user.name} · {ROLE_LABEL[user.role]}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <CharterSwitcher />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cambiar tema"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {mounted && theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Salir" onClick={logout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

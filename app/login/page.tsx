"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Anchor, Shield, ChefHat, Eye } from "lucide-react";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { ROLE_LABEL, ROLE_DESCRIPTION } from "@/lib/permissions";
import type { Role } from "@/lib/domain/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uid } from "@/lib/utils";

const ROLE_ICONS: Record<Role, typeof Shield> = {
  admin: Shield,
  cocinero: ChefHat,
  lectura: Eye,
};

export default function LoginPage() {
  const { setUser, mode, user, ready } = useRepoContext();
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  async function pick(role: Role) {
    await setUser({
      id: uid("u-"),
      name: name.trim() || ROLE_LABEL[role],
      role,
    });
    router.replace("/");
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-primary to-ocean flex flex-col items-center justify-center p-5 text-primary-foreground">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="h-20 w-20 rounded-3xl bg-white/15 backdrop-blur flex items-center justify-center mb-4">
            <Anchor className="h-10 w-10" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Nomad Stock</h1>
          <p className="text-primary-foreground/80 mt-1">
            Control de stock · Nomad Sailors
          </p>
        </div>

        <Card className="p-5 text-card-foreground">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Tu nombre</Label>
              <Input
                id="name"
                placeholder="Ej: Martín (cocinero)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Entrar como</p>
              <div className="space-y-2">
                {(Object.keys(ROLE_LABEL) as Role[]).map((role) => {
                  const Icon = ROLE_ICONS[role];
                  return (
                    <button
                      key={role}
                      onClick={() => pick(role)}
                      className="w-full text-left rounded-2xl border p-3 flex items-start gap-3 hover:bg-accent/10 transition-colors active:scale-[0.99]"
                    >
                      <div className="h-11 w-11 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold">{ROLE_LABEL[role]}</div>
                        <div className="text-xs text-muted-foreground">
                          {ROLE_DESCRIPTION[role]}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-primary-foreground/70 mt-4">
          {mode === "demo"
            ? "Modo demo · datos de ejemplo en este dispositivo"
            : "Conectado a Supabase"}
        </p>
      </div>
    </div>
  );
}

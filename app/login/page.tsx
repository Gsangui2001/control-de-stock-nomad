"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Anchor, Shield, ChefHat, Eye, Loader2 } from "lucide-react";
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
  const { mode, user, ready } = useRepoContext();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

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

        {mode === "demo" ? <DemoLogin /> : <SupabaseLogin />}

        <p className="text-center text-xs text-primary-foreground/70 mt-4">
          {mode === "demo"
            ? "Modo demo · datos de ejemplo en este dispositivo"
            : "Conectado a Supabase"}
        </p>
      </div>
    </div>
  );
}

function DemoLogin() {
  const { setUser } = useRepoContext();
  const router = useRouter();
  const [name, setName] = useState("");

  async function pick(role: Role) {
    await setUser({ id: uid("u-"), name: name.trim() || ROLE_LABEL[role], role });
    router.replace("/");
  }

  return (
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
  );
}

function SupabaseLogin() {
  const { repo, refresh } = useRepoContext();
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (tab === "login") {
        const res = await repo.signIn(email.trim(), password);
        if (res.error) {
          setError(res.error);
          return;
        }
        refresh();
        router.replace("/");
      } else {
        const res = await repo.signUp(email.trim(), password, name.trim() || email.trim());
        if (res.error) {
          setError(res.error);
          return;
        }
        // Si el proyecto tiene confirmación por email activada, no hay sesión aún.
        const u = await repo.getCurrentUser();
        if (u) {
          refresh();
          router.replace("/");
        } else {
          setInfo("Cuenta creada. Revisá tu email para confirmarla y después entrá.");
          setTab("login");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 text-card-foreground">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 mb-4">
        {(["login", "signup"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setError(null); setInfo(null); }}
            className={
              "rounded-lg py-1.5 text-sm font-medium transition-colors " +
              (tab === t ? "bg-background shadow-sm" : "text-muted-foreground")
            }
          >
            {t === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {tab === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@ejemplo.com" autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={tab === "login" ? "current-password" : "new-password"} minLength={6} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {info && <p className="text-sm text-success">{info}</p>}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {tab === "login" ? "Entrar" : "Crear cuenta"}
        </Button>
      </form>
    </Card>
  );
}

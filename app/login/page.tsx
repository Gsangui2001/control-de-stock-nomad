"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Anchor, Shield, ClipboardList, Loader2 } from "lucide-react";
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
  gestor: ClipboardList,
};

export default function LoginPage() {
  const { mode, user, ready } = useRepoContext();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-primary via-ocean to-primary/80 flex flex-col items-center justify-center p-5 text-primary-foreground overflow-hidden relative">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="h-24 w-24 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-5 shadow-2xl ring-1 ring-white/30">
            <Anchor className="h-12 w-12" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">NOMADE</h1>
          <p className="text-primary-foreground/90 mt-2 font-medium">
            Gastos de flota · Nomad Sailors
          </p>
        </div>

        {mode === "demo" ? <DemoLogin /> : <SupabaseLogin />}

        <p className="text-center text-xs text-primary-foreground/60 mt-6 font-medium">
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
    <Card className="p-6 text-card-foreground shadow-2xl backdrop-blur-sm bg-card/95 ring-1 ring-white/20">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-semibold">Tu nombre</Label>
          <Input
            id="name"
            placeholder="Ej: Martín"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
        </div>

        <div>
          <p className="text-sm font-semibold mb-3">Entrar como</p>
          <div className="space-y-2.5">
            {(Object.keys(ROLE_LABEL) as Role[]).map((role) => {
              const Icon = ROLE_ICONS[role];
              return (
                <button
                  key={role}
                  onClick={() => pick(role)}
                  className="w-full text-left rounded-xl border border-border/60 p-4 flex items-start gap-3.5 hover:bg-accent/15 hover:border-accent/50 transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-bold text-sm">{ROLE_LABEL[role]}</div>
                    <div className="text-xs text-muted-foreground mt-1">
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
    <Card className="p-6 text-card-foreground shadow-2xl backdrop-blur-sm bg-card/95 ring-1 ring-white/20">
      <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted/50 p-1 mb-6">
        {(["login", "signup"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setError(null); setInfo(null); }}
            className={
              "rounded-md py-2 text-sm font-semibold transition-all " +
              (tab === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")
            }
          >
            {t === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {tab === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-semibold">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre completo" className="h-11" />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@ejemplo.com" autoComplete="email" className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-semibold">Contraseña</Label>
          <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={tab === "login" ? "current-password" : "new-password"} minLength={6} className="h-11" />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            {error}
          </div>
        )}
        {info && (
          <div className="p-3 rounded-lg bg-success/10 border border-success/30 text-sm text-success">
            {info}
          </div>
        )}

        <Button type="submit" size="lg" className="w-full font-semibold h-11 mt-2" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {tab === "login" ? "Entrar" : "Crear cuenta"}
        </Button>
      </form>
    </Card>
  );
}

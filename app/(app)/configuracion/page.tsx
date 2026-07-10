"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Users, Info } from "lucide-react";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { canManage, ROLE_LABEL } from "@/lib/permissions";
import { DemoRepo } from "@/lib/repo/demoRepo";
import { PageContainer, PageTitle, DemoBanner } from "@/components/app/common";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CURRENCIES = ["USD", "ARS", "EUR", "BRL"];

export default function ConfiguracionPage() {
  const { repo, settings, refresh, user, mode } = useRepoContext();
  const manage = canManage(user?.role);
  const [currency, setCurrency] = useState(settings.currency);
  const [allowNegative, setAllowNegative] = useState(settings.allowNegativeStock);
  const [expiryDays, setExpiryDays] = useState(settings.expiryWarningDays);

  async function saveSettings(patch: Partial<typeof settings>) {
    await repo.updateSettings(patch);
    refresh();
    toast.success("Configuración guardada");
  }

  async function resetDemo() {
    if (repo instanceof DemoRepo) {
      await repo.resetDemo();
      refresh();
      toast.success("Datos demo restaurados");
    }
  }

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle title="Configuración" />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <div className="flex gap-2 flex-wrap">
              {CURRENCIES.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={currency === c ? "default" : "outline"}
                  disabled={!manage}
                  onClick={() => {
                    setCurrency(c);
                    saveSettings({ currency: c });
                  }}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="pr-4">
              <Label htmlFor="neg">Permitir stock negativo</Label>
              <p className="text-xs text-muted-foreground">
                Deja preparar platos aunque no alcance el stock.
              </p>
            </div>
            <Switch
              id="neg"
              checked={allowNegative}
              disabled={!manage}
              onCheckedChange={(v) => {
                setAllowNegative(v);
                saveSettings({ allowNegativeStock: v });
              }}
            />
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="expiry">Avisar vencimiento (días antes)</Label>
            <Input
              id="expiry"
              type="number"
              className="w-28"
              value={expiryDays}
              disabled={!manage}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              onBlur={() => saveSettings({ expiryWarningDays: expiryDays })}
            />
          </div>
        </CardContent>
      </Card>

      {manage && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-2.5">
              <Users className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">Usuarios y roles</div>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {mode === "demo"
                    ? "En modo demo, cada quien elige su rol al entrar (Admin, Cocinero, Solo lectura)."
                    : "Los usuarios se gestionan en Supabase (tabla profiles). El rol define permisos."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              Sesión: <strong>{user?.name}</strong> ({user ? ROLE_LABEL[user.role] : "—"}) · Modo{" "}
              <strong>{mode === "demo" ? "Demo" : "Supabase"}</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {mode === "demo" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full text-destructive">
              <RotateCcw className="h-4 w-4" /> Restaurar datos demo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Restaurar datos demo?</AlertDialogTitle>
              <AlertDialogDescription>
                Se borrarán todos los cambios y se volverá a los datos de ejemplo iniciales.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={resetDemo}>Restaurar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </PageContainer>
  );
}

"use client";

import { toast } from "sonner";
import { RotateCcw, Users, Info } from "lucide-react";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { canManage, ROLE_LABEL } from "@/lib/permissions";
import { DemoRepo } from "@/lib/repo/demoRepo";
import { PageContainer, PageTitle, DemoBanner } from "@/components/app/common";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export default function ConfiguracionPage() {
  const { repo, refresh, user, mode } = useRepoContext();
  const manage = canManage(user?.role);

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

      {manage && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-2.5">
              <Users className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">Usuarios y roles</div>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {mode === "demo"
                    ? "En modo demo, cada quien elige su rol al entrar (Admin, Gestor)."
                    : "Los usuarios se gestionan desde Supabase (tabla boat_expense_users). El rol define permisos."}
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

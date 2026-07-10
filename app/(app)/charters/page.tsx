"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Ship, Plus, Users, Check } from "lucide-react";
import { useCharters } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { canManage } from "@/lib/permissions";
import { uid } from "@/lib/utils";
import type { Charter, CharterStatus } from "@/lib/domain/types";
import {
  PageContainer,
  PageTitle,
  EmptyState,
  DemoBanner,
} from "@/components/app/common";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const STATUS: { key: CharterStatus; label: string; variant: "secondary" | "success" | "outline" }[] = [
  { key: "proximo", label: "Próximo", variant: "secondary" },
  { key: "activo", label: "Activo", variant: "success" },
  { key: "finalizado", label: "Finalizado", variant: "outline" },
];

const statusInfo = (s: CharterStatus) => STATUS.find((x) => x.key === s)!;

export default function ChartersPage() {
  const { data: charters } = useCharters();
  const { repo, refresh, user, activeCharter, setActiveCharter } = useRepoContext();
  const manage = canManage(user?.role);
  const [editing, setEditing] = useState<Charter | null>(null);
  const [open, setOpen] = useState(false);

  function newCharter() {
    setEditing({
      id: uid("charter-"),
      code: `NS-${new Date().getFullYear()}-`,
      status: "proximo",
    });
    setOpen(true);
  }

  async function save() {
    if (!editing) return;
    if (!editing.code.trim()) {
      toast.error("Poné un código al charter");
      return;
    }
    await repo.upsertCharter(editing);
    refresh();
    toast.success("Charter guardado");
    setOpen(false);
    setEditing(null);
  }

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle
        title="Charters"
        subtitle={`${charters.length} charters`}
        action={
          manage ? (
            <Button size="icon" aria-label="Nuevo charter" onClick={newCharter}>
              <Plus className="h-5 w-5" />
            </Button>
          ) : undefined
        }
      />

      {charters.length === 0 ? (
        <EmptyState
          icon={<Ship className="h-8 w-8" />}
          title="Sin charters"
          description="Creá un charter para asociar consumos."
          action={manage ? <Button onClick={newCharter}>Crear charter</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {charters.map((c) => {
            const info = statusInfo(c.status);
            const isActive = activeCharter?.id === c.id;
            return (
              <Card key={c.id} className={isActive ? "border-primary" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{c.code}</span>
                        <Badge variant={info.variant}>{info.label}</Badge>
                        {isActive && <Badge variant="accent">En uso</Badge>}
                      </div>
                      {c.customerName && <div className="text-sm text-muted-foreground">{c.customerName}</div>}
                    </div>
                    {c.guestCount != null && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" /> {c.guestCount}
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-3">
                    {c.startDate && <span>Desde {format(new Date(c.startDate), "dd MMM", { locale: es })}</span>}
                    {c.endDate && <span>Hasta {format(new Date(c.endDate), "dd MMM", { locale: es })}</span>}
                    {c.boat && <span>· {c.boat}</span>}
                  </div>

                  <div className="flex gap-2 mt-3">
                    {c.status !== "finalizado" && (
                      <Button
                        size="sm"
                        variant={isActive ? "outline" : "default"}
                        onClick={() => setActiveCharter(isActive ? undefined : c.id)}
                      >
                        {isActive ? "Quitar activo" : "Marcar activo"}
                      </Button>
                    )}
                    {manage && (
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                        Editar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{editing && charters.find((c) => c.id === editing.id) ? "Editar charter" : "Nuevo charter"}</SheetTitle>
          </SheetHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Código</Label>
                  <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v as CharterStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS.map((s) => (
                        <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cliente / grupo</Label>
                <Input value={editing.customerName ?? ""} onChange={(e) => setEditing({ ...editing, customerName: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Desde</Label>
                  <Input type="date" value={editing.startDate ?? ""} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Hasta</Label>
                  <Input type="date" value={editing.endDate ?? ""} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Personas</Label>
                  <Input type="number" value={editing.guestCount ?? ""} onChange={(e) => setEditing({ ...editing, guestCount: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Barco</Label>
                  <Input value={editing.boat ?? ""} onChange={(e) => setEditing({ ...editing, boat: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Textarea value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
              <Button size="xl" className="w-full" onClick={save}>
                <Check className="h-5 w-5" /> Guardar charter
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}

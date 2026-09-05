"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Receipt, Camera, Loader2, TriangleAlert, Trash2, Wrench, Fuel, Anchor, Package } from "lucide-react";
import { useBoats, useExpenses } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { canManage, canWrite } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";
import { compressImageToDataUrl } from "@/lib/imageUtils";
import { EXPENSE_CATEGORIES, categoryLabel } from "@/lib/domain/types";
import type { Expense, ExpenseCategoryKey } from "@/lib/domain/types";
import {
  PageContainer,
  PageTitle,
  EmptyState,
  DemoBanner,
} from "@/components/app/common";
import { Fab } from "@/components/app/Fab";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const CATEGORY_ICON: Record<ExpenseCategoryKey, typeof Wrench> = {
  mantenimiento: Wrench,
  combustible: Fuel,
  amarre_marina_permisos: Anchor,
  otros_operativos: Package,
};

interface ScanInvoiceResult {
  vendor: string | null;
  date: string | null;
  totalAmount: number | null;
  description: string | null;
  suggestedCategory: ExpenseCategoryKey | null;
  error?: string;
}

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      const mediaType = result.match(/^data:(.*?);base64/)?.[1] ?? file.type;
      resolve({ base64, mediaType });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const today = () => new Date().toISOString().slice(0, 10);

export default function GastosPage() {
  const { data: boats } = useBoats();
  const { data: expenses } = useExpenses();
  const { repo, refresh, user } = useRepoContext();
  const write = canWrite(user?.role);
  const manage = canManage(user?.role);

  async function remove(id: string) {
    if (!window.confirm("¿Borrar este gasto? No se puede deshacer.")) return;
    await repo.deleteExpense(id);
    refresh();
    toast.success("Gasto borrado");
  }

  const [open, setOpen] = useState(false);
  const [boatId, setBoatId] = useState("");
  const [category, setCategory] = useState<ExpenseCategoryKey>("mantenimiento");
  const [categoryConfirmed, setCategoryConfirmed] = useState(true);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | undefined>();
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function boatName(id: string) {
    return boats.find((b) => b.id === id)?.name ?? "—";
  }

  function openNew() {
    setBoatId(boats[0]?.id ?? "");
    setCategory("mantenimiento");
    setCategoryConfirmed(true);
    setAmount("");
    setDate(today());
    setVendor("");
    setDescription("");
    setReceiptImageUrl(undefined);
    setOpen(true);
  }

  async function handlePhoto(file: File) {
    try {
      const compressed = await compressImageToDataUrl(file);
      setReceiptImageUrl(compressed);
    } catch {
      toast.error("No se pudo procesar la foto. Probá con otra.");
      return;
    }

    setScanning(true);
    try {
      const { base64, mediaType } = await fileToBase64(file);
      const res = await fetch("/api/scan-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data: ScanInvoiceResult = await res.json();
      if (!res.ok) {
        toast.error(data.error || "No se pudo leer la factura", {
          description: "La foto quedó adjunta igual — completá los datos a mano.",
        });
        return;
      }
      if (data.vendor) setVendor((v) => v || data.vendor!);
      if (data.description) setDescription((d) => d || data.description!);
      if (data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) setDate(data.date);
      if (typeof data.totalAmount === "number" && data.totalAmount > 0) {
        setAmount((a) => a || String(data.totalAmount));
      }
      if (data.suggestedCategory) {
        setCategory(data.suggestedCategory);
        setCategoryConfirmed(false);
      }
      toast.success("Factura leída", { description: "Revisá los datos antes de guardar" });
    } catch {
      toast.error("No se pudo leer la factura. La foto quedó adjunta igual.");
    } finally {
      setScanning(false);
    }
  }

  async function submit() {
    if (!boatId) {
      toast.error("Elegí un barco");
      return;
    }
    const amountUsd = Number(amount);
    if (!amountUsd || amountUsd <= 0) {
      toast.error("Cargá un monto válido");
      return;
    }
    await repo.createExpense({
      boatId,
      category,
      amountUsd,
      expenseDate: date,
      vendor: vendor || undefined,
      description: description || undefined,
      receiptImageUrl,
    });
    refresh();
    toast.success("Gasto cargado");
    setOpen(false);
  }

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle title="Gastos" subtitle={`${expenses.length} gastos cargados`} />
      {write && <Fab label="Gasto" onClick={openNew} />}

      {!write && (
        <p className="text-sm text-muted-foreground">No tenés permiso para cargar gastos.</p>
      )}

      {expenses.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title="Sin gastos"
          description="Cargá el primer gasto del barco."
          action={write ? <Button onClick={openNew}>Cargar gasto</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {expenses.map((exp: Expense) => {
            const Icon = CATEGORY_ICON[exp.category];
            return (
              <Card key={exp.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {exp.vendor || categoryLabel(exp.category)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {boatName(exp.boatId)} · {categoryLabel(exp.category)} ·{" "}
                        {format(new Date(`${exp.expenseDate}T00:00:00`), "dd MMM yyyy", { locale: es })}
                      </div>
                      {exp.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {exp.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold">{formatMoney(exp.amountUsd)}</div>
                    {manage && (
                      <button
                        onClick={() => remove(exp.id)}
                        aria-label="Borrar gasto"
                        className="mt-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Nuevo gasto</SheetTitle>
          </SheetHeader>
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handlePhoto(file);
              }}
            />
            <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-center">
              <Button
                size="lg"
                variant="outline"
                className="w-full bg-background"
                disabled={scanning}
                onClick={() => fileInputRef.current?.click()}
              >
                {scanning ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
                {scanning ? "Leyendo factura..." : receiptImageUrl ? "Cambiar foto" : "Adjuntar foto de factura"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                {receiptImageUrl
                  ? "Foto adjunta — completamos los datos que pudimos leer"
                  : "Sacá una foto de la factura y completamos los datos automáticamente"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Barco</Label>
              <Select value={boatId} onValueChange={setBoatId}>
                <SelectTrigger><SelectValue placeholder="Elegí un barco" /></SelectTrigger>
                <SelectContent>
                  {boats.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Categoría</Label>
              {!categoryConfirmed && (
                <div className="flex items-center gap-1.5 text-xs text-warning-foreground">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  Sugerida por la foto — confirmá que sea la correcta
                </div>
              )}
              <Select
                value={category}
                onValueChange={(v) => { setCategory(v as ExpenseCategoryKey); setCategoryConfirmed(true); }}
              >
                <SelectTrigger className={categoryConfirmed ? "" : "border-warning/60"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Monto (USD)</Label>
                <Input id="amount" type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Fecha</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vendor">Proveedor</Label>
              <Input id="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Opcional" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
            </div>

            <Button size="xl" className="w-full" onClick={submit}>
              Cargar gasto
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import type { Product } from "@/lib/domain/types";
import { MOVEMENT_LABEL } from "@/lib/domain/units";
import { QuantityStepper } from "@/components/app/QuantityStepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdjustStockInput } from "@/lib/repo/Repo";

const TYPES: AdjustStockInput["type"][] = [
  "ajuste",
  "merma",
  "devolucion",
  "correccion",
  "transferencia",
];

export function AdjustStockDialog({
  product,
  open,
  onOpenChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { repo, refresh } = useRepoContext();
  const [direction, setDirection] = useState<"add" | "sub">("sub");
  const [amount, setAmount] = useState(1);
  const [type, setType] = useState<AdjustStockInput["type"]>("ajuste");
  const [notes, setNotes] = useState("");

  if (!product) return null;

  async function apply() {
    if (!product) return;
    const delta = direction === "add" ? amount : -amount;
    await repo.adjustStock({ productId: product.id, delta, type, notes: notes || undefined });
    refresh();
    toast.success(`Stock ajustado (${delta > 0 ? "+" : ""}${delta} ${product.unit})`);
    onOpenChange(false);
    setAmount(1);
    setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar stock · {product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Actual: <strong>{product.currentQuantity} {product.unit}</strong>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={direction === "add" ? "default" : "outline"}
              onClick={() => setDirection("add")}
            >
              Sumar (+)
            </Button>
            <Button
              variant={direction === "sub" ? "default" : "outline"}
              onClick={() => setDirection("sub")}
            >
              Restar (−)
            </Button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <QuantityStepper value={amount} onChange={setAmount} min={0} />
            <Input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="w-32 text-center"
            />
            <span className="text-xs text-muted-foreground">en {product.unit}</span>
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de movimiento</Label>
            <Select value={type} onValueChange={(v) => setType(v as AdjustStockInput["type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{MOVEMENT_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo del ajuste" />
          </div>
        </div>
        <DialogFooter>
          <Button size="lg" onClick={apply}>Aplicar ajuste</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

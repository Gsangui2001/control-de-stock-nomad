"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import type { Product } from "@/lib/domain/types";
import { CATEGORIES, UNITS, LOCATIONS } from "@/lib/domain/units";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";

const schema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  category: z.string(),
  unit: z.string(),
  location: z.string(),
  currentQuantity: z.coerce.number().min(0, "≥ 0"),
  averageUnitCost: z.coerce.number().min(0, "≥ 0"),
  minimumQuantity: z.coerce.number().min(0, "≥ 0"),
  criticalQuantity: z.coerce.number().min(0, "≥ 0"),
  supplier: z.string().optional(),
  expirationDate: z.string().optional(),
});

type FormValues = z.input<typeof schema>;

export function ProductForm({
  product,
  onDone,
}: {
  product?: Product;
  onDone: () => void;
}) {
  const { repo, refresh } = useRepoContext();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: product?.name ?? "",
      category: product?.category ?? "verduras",
      unit: product?.unit ?? "g",
      location: product?.location ?? "cocina",
      currentQuantity: product?.currentQuantity ?? 0,
      averageUnitCost: product?.averageUnitCost ?? 0,
      minimumQuantity: product?.minimumQuantity ?? 0,
      criticalQuantity: product?.criticalQuantity ?? 0,
      supplier: product?.supplier ?? "",
      expirationDate: product?.expirationDate ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    const parsed = schema.parse(values);
    const now = new Date().toISOString();
    const saved: Product = {
      id: product?.id ?? uid("prod-"),
      name: parsed.name,
      category: parsed.category as Product["category"],
      unit: parsed.unit as Product["unit"],
      location: parsed.location as Product["location"],
      currentQuantity: parsed.currentQuantity,
      averageUnitCost: parsed.averageUnitCost,
      minimumQuantity: parsed.minimumQuantity,
      criticalQuantity: parsed.criticalQuantity,
      supplier: parsed.supplier || undefined,
      expirationDate: parsed.expirationDate || undefined,
      active: product?.active ?? true,
      createdAt: product?.createdAt ?? now,
      updatedAt: now,
    };
    await repo.upsertProduct(saved);
    refresh();
    toast.success(product ? "Producto actualizado" : "Producto creado");
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" {...register("name")} placeholder="Ej: Papa" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <Select value={watch("category")} onValueChange={(v) => setValue("category", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Unidad</Label>
          <Select value={watch("unit")} onValueChange={(v) => setValue("unit", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="currentQuantity">Cantidad actual</Label>
          <Input id="currentQuantity" type="number" step="any" {...register("currentQuantity")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="averageUnitCost">Costo unitario</Label>
          <Input id="averageUnitCost" type="number" step="any" {...register("averageUnitCost")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="minimumQuantity">Stock mínimo</Label>
          <Input id="minimumQuantity" type="number" step="any" {...register("minimumQuantity")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="criticalQuantity">Stock crítico</Label>
          <Input id="criticalQuantity" type="number" step="any" {...register("criticalQuantity")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Ubicación</Label>
          <Select value={watch("location")} onValueChange={(v) => setValue("location", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((l) => (
                <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expirationDate">Vencimiento</Label>
          <Input id="expirationDate" type="date" {...register("expirationDate")} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="supplier">Proveedor (opcional)</Label>
        <Input id="supplier" {...register("supplier")} placeholder="Ej: Pesca del Río" />
      </div>

      <DialogFooter>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {product ? "Guardar cambios" : "Crear producto"}
        </Button>
      </DialogFooter>
    </form>
  );
}

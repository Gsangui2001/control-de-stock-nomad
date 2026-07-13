"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Save, Camera, X, Loader2 } from "lucide-react";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { useProducts } from "@/lib/hooks";
import type { Recipe, RecipeItem } from "@/lib/domain/types";
import { recipeServingCost } from "@/lib/domain/stock";
import { canManage } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";
import { compressImageToDataUrl } from "@/lib/imageUtils";
import { PageContainer, PageTitle, ListSkeleton, EmptyState } from "@/components/app/common";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMOJIS = ["🍽️", "🐟", "🍗", "🍝", "🥗", "🍳", "🍉", "🌱", "🥩", "🍤", "🥘", "🍹"];

export default function RecipeEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { repo, refresh, user, settings } = useRepoContext();
  const { data: products } = useProducts();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const manage = canManage(user?.role);

  async function onPhotoPicked(file: File) {
    setProcessingPhoto(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setRecipe((r) => (r ? { ...r, imageUrl: dataUrl } : r));
      toast.success("Foto cargada", { description: "Guardá el plato para confirmarla" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cargar la foto");
    } finally {
      setProcessingPhoto(false);
    }
  }

  useEffect(() => {
    repo.getRecipe(params.id).then((r) => {
      setRecipe(r ?? null);
      setLoading(false);
    });
  }, [repo, params.id]);

  if (loading) {
    return (
      <PageContainer>
        <ListSkeleton rows={5} />
      </PageContainer>
    );
  }
  if (!recipe) {
    return (
      <PageContainer>
        <PageTitle title="Plato" back="/platos" />
        <EmptyState title="Plato no encontrado" />
      </PageContainer>
    );
  }

  const set = (patch: Partial<Recipe>) => setRecipe({ ...recipe, ...patch });

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "";
  const productUnit = (id: string) => products.find((p) => p.id === id)?.unit ?? "unidad";

  function addItem() {
    const first = products[0];
    if (!first) {
      toast.error("Primero creá productos en Stock");
      return;
    }
    const item: RecipeItem = {
      productId: first.id,
      quantityPerServing: 1,
      unit: first.unit,
    };
    set({ items: [...recipe!.items, item] });
  }

  function updateItem(idx: number, patch: Partial<RecipeItem>) {
    const items = recipe!.items.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, ...patch };
      if (patch.productId) next.unit = productUnit(patch.productId);
      return next;
    });
    set({ items });
  }

  function removeItem(idx: number) {
    set({ items: recipe!.items.filter((_, i) => i !== idx) });
  }

  async function save() {
    if (!recipe!.name.trim()) {
      toast.error("Poné un nombre al plato");
      return;
    }
    await repo.upsertRecipe(recipe!);
    refresh();
    toast.success("Plato guardado");
    router.push("/platos");
  }

  async function remove() {
    await repo.deleteRecipe(recipe!.id);
    refresh();
    toast.success("Plato eliminado");
    router.push("/platos");
  }

  const cost = recipeServingCost(recipe, products);
  const readOnly = !manage;

  return (
    <PageContainer>
      <PageTitle title="Editar plato" back="/platos" />

      {readOnly && (
        <p className="text-sm text-muted-foreground">
          Solo un admin puede editar recetas.
        </p>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onPhotoPicked(file);
            }}
          />
          <div className="space-y-1.5">
            <Label>Foto del plato</Label>
            {recipe.imageUrl ? (
              <div className="relative overflow-hidden rounded-2xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={recipe.imageUrl}
                  alt={recipe.name}
                  className="h-44 w-full object-cover"
                />
                {!readOnly && (
                  <div className="absolute bottom-2 right-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shadow-soft"
                      disabled={processingPhoto}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      <Camera className="h-4 w-4" /> Cambiar
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-9 w-9 shadow-soft"
                      aria-label="Quitar foto"
                      disabled={processingPhoto}
                      onClick={() => set({ imageUrl: undefined })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled={readOnly || processingPhoto}
                onClick={() => photoInputRef.current?.click()}
                className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                {processingPhoto ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Camera className="h-6 w-6" />
                )}
                {processingPhoto ? "Procesando..." : "Agregar foto del plato"}
              </button>
            )}
          </div>

          <div className="flex gap-3">
            <div className="space-y-1.5">
              <Label>Ícono</Label>
              <Select value={recipe.icon ?? "🍽️"} onValueChange={(v) => set({ icon: v })} disabled={readOnly}>
                <SelectTrigger className="w-20 text-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMOJIS.map((e) => (
                    <SelectItem key={e} value={e}><span className="text-2xl">{e}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="rname">Nombre</Label>
              <Input id="rname" value={recipe.name} onChange={(e) => set({ name: e.target.value })} disabled={readOnly} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rcat">Categoría</Label>
              <Input id="rcat" value={recipe.category ?? ""} onChange={(e) => set({ category: e.target.value })} placeholder="Almuerzo, Cena…" disabled={readOnly} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rprice">Precio ref. (opcional)</Label>
              <Input id="rprice" type="number" step="any" value={recipe.referencePrice ?? ""} onChange={(e) => set({ referencePrice: e.target.value ? Number(e.target.value) : undefined })} disabled={readOnly} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rdesc">Descripción</Label>
            <Textarea id="rdesc" value={recipe.description ?? ""} onChange={(e) => set({ description: e.target.value })} disabled={readOnly} />
          </div>

          <div className="flex items-center justify-between rounded-xl border p-3">
            <Label htmlFor="ractive">Plato activo</Label>
            <Switch id="ractive" checked={recipe.active} onCheckedChange={(v) => set({ active: v })} disabled={readOnly} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Ingredientes por porción</h2>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {recipe.items.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin ingredientes todavía.</p>
        )}
        {recipe.items.map((it, idx) => (
          <Card key={idx} className="p-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Select value={it.productId} onValueChange={(v) => updateItem(idx, { productId: v })} disabled={readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                type="number"
                step="any"
                className="w-24 text-center"
                value={it.quantityPerServing}
                onChange={(e) => updateItem(idx, { quantityPerServing: Number(e.target.value) })}
                disabled={readOnly}
              />
              <span className="text-sm text-muted-foreground w-14">{productUnit(it.productId)}</span>
              {!readOnly && (
                <Button size="icon" variant="ghost" aria-label="Quitar" onClick={() => removeItem(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <span className="text-muted-foreground">Costo por porción</span>
          <span className="text-xl font-bold">{formatMoney(cost, settings.currency)}</span>
        </CardContent>
      </Card>

      {!readOnly && (
        <div className="space-y-2">
          <Button size="lg" className="w-full" onClick={save}>
            <Save className="h-5 w-5" /> Guardar plato
          </Button>
          <Button size="lg" variant="ghost" className="w-full text-destructive" onClick={remove}>
            <Trash2 className="h-5 w-5" /> Eliminar plato
          </Button>
        </div>
      )}
    </PageContainer>
  );
}

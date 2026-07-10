"use client";

import { useMemo, useState } from "react";
import { format, addDays, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ShoppingCart, Ship } from "lucide-react";
import { useMealPlans } from "@/lib/hooks";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { PageContainer, PageTitle, DemoBanner } from "@/components/app/common";
import { DayView } from "@/components/planificacion/DayView";
import { WeekView } from "@/components/planificacion/WeekView";
import { MonthView } from "@/components/planificacion/MonthView";
import { ShoppingListSheet } from "@/components/planificacion/ShoppingListSheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type View = "dia" | "semana" | "mes";

function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

export default function PlanificacionPage() {
  const { activeCharter } = useRepoContext();
  const { data: plans } = useMealPlans(
    activeCharter ? { charterId: activeCharter.id } : undefined
  );
  const [view, setView] = useState<View>("dia");
  const [date, setDate] = useState<string>(todayISO());
  const [shopOpen, setShopOpen] = useState(false);

  const ref = useMemo(() => new Date(date + "T12:00:00"), [date]);

  function shift(dir: 1 | -1) {
    if (view === "mes") setDate(format(addMonths(ref, dir), "yyyy-MM-dd"));
    else if (view === "semana") setDate(format(addDays(ref, dir * 7), "yyyy-MM-dd"));
    else setDate(format(addDays(ref, dir), "yyyy-MM-dd"));
  }

  const headerLabel =
    view === "mes"
      ? format(ref, "MMMM yyyy", { locale: es })
      : view === "semana"
      ? `Semana del ${format(ref, "d MMM", { locale: es })}`
      : format(ref, "EEEE d 'de' MMMM", { locale: es });

  function pickDay(iso: string) {
    setDate(iso);
    setView("dia");
  }

  return (
    <PageContainer>
      <DemoBanner />
      <PageTitle
        title="Planificación"
        subtitle={
          activeCharter ? `Charter ${activeCharter.code}` : "Sin charter activo"
        }
        action={
          <Button size="icon" aria-label="Lista de compras" onClick={() => setShopOpen(true)}>
            <ShoppingCart className="h-5 w-5" />
          </Button>
        }
      />

      {!activeCharter && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Ship className="h-3.5 w-3.5" /> Elegí un charter activo (arriba) para planificar sus comidas.
        </p>
      )}

      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="dia">Día</TabsTrigger>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="mes">Mes</TabsTrigger>
        </TabsList>

        {/* Navegador de fecha */}
        <div className="flex items-center justify-between my-3">
          <Button size="icon" variant="outline" aria-label="Anterior" onClick={() => shift(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col items-center">
            <span className="font-semibold capitalize text-center">{headerLabel}</span>
            <button className="text-xs text-primary" onClick={() => setDate(todayISO())}>
              Ir a hoy
            </button>
          </div>
          <Button size="icon" variant="outline" aria-label="Siguiente" onClick={() => shift(1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <TabsContent value="dia">
          <DayView date={date} plans={plans} />
        </TabsContent>
        <TabsContent value="semana">
          <WeekView date={date} plans={plans} onPickDay={pickDay} />
        </TabsContent>
        <TabsContent value="mes">
          <MonthView date={date} plans={plans} onPickDay={pickDay} />
        </TabsContent>
      </Tabs>

      <ShoppingListSheet
        open={shopOpen}
        onOpenChange={setShopOpen}
        plans={plans}
        date={date}
        charterLabel={activeCharter ? `Charter ${activeCharter.code}` : "Todo el plan"}
      />
    </PageContainer>
  );
}

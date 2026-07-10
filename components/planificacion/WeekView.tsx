"use client";

import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import type { PlannedMeal } from "@/lib/domain/types";
import { MEAL_SLOTS, mealItemCount } from "@/lib/domain/planning";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function WeekView({
  date,
  plans,
  onPickDay,
}: {
  date: string;
  plans: PlannedMeal[];
  onPickDay: (isoDate: string) => void;
}) {
  const ref = new Date(date + "T12:00:00");
  const monday = startOfWeek(ref, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }).map((_, i) => addDays(monday, i));

  return (
    <div className="space-y-2">
      {days.map((d) => {
        const iso = format(d, "yyyy-MM-dd");
        const dayPlans = plans.filter((p) => p.date === iso);
        const isToday = isSameDay(d, new Date());
        return (
          <Card
            key={iso}
            className={cn("cursor-pointer active:scale-[0.99] transition-transform", isToday && "border-primary")}
            onClick={() => onPickDay(iso)}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold capitalize">
                  {format(d, "EEEE d", { locale: es })}
                  {isToday && <span className="text-primary text-xs ml-2">hoy</span>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {dayPlans.length === 0 ? "sin plan" : `${dayPlans.length} comida(s)`}
                </span>
              </div>
              {dayPlans.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {MEAL_SLOTS.map((s) => {
                    const meal = dayPlans.find((p) => p.slot === s.key);
                    if (!meal || mealItemCount(meal) === 0) return null;
                    return (
                      <span
                        key={s.key}
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full border",
                          meal.status === "preparado"
                            ? "bg-success/10 border-success/40 text-success"
                            : "bg-primary/5 border-primary/30"
                        )}
                      >
                        {s.icon} {s.label} · {mealItemCount(meal)}
                      </span>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

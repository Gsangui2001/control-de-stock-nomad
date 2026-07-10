"use client";

import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
} from "date-fns";
import type { PlannedMeal } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

export function MonthView({
  date,
  plans,
  onPickDay,
}: {
  date: string;
  plans: PlannedMeal[];
  onPickDay: (isoDate: string) => void;
}) {
  const ref = new Date(date + "T12:00:00");
  const gridStart = startOfWeek(startOfMonth(ref), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(ref), { weekStartsOn: 1 });

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const planCount = (iso: string) => plans.filter((p) => p.date === iso).length;

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-xs text-muted-foreground font-medium py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          const inMonth = isSameMonth(d, ref);
          const isToday = isSameDay(d, new Date());
          const count = planCount(iso);
          return (
            <button
              key={iso}
              onClick={() => onPickDay(iso)}
              className={cn(
                "aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 text-sm transition-colors active:scale-95",
                inMonth ? "bg-background hover:bg-accent/10" : "bg-muted/30 text-muted-foreground",
                isToday && "border-primary ring-1 ring-primary"
              )}
            >
              <span className={cn(isToday && "font-bold text-primary")}>{format(d, "d")}</span>
              {count > 0 && (
                <span className="flex gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full bg-primary" />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

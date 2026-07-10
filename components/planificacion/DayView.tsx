"use client";

import { useState } from "react";
import type { MealSlot, PlannedMeal } from "@/lib/domain/types";
import { MEAL_SLOTS } from "@/lib/domain/planning";
import { MealSlotCard } from "./MealSlotCard";
import { AddMealSheet } from "./AddMealSheet";

export function DayView({ date, plans }: { date: string; plans: PlannedMeal[] }) {
  const [editing, setEditing] = useState<{ slot: MealSlot; meal?: PlannedMeal } | null>(null);

  const mealFor = (slot: MealSlot) =>
    plans.find((p) => p.date === date && p.slot === slot);

  return (
    <div className="space-y-3">
      {MEAL_SLOTS.map((s) => (
        <MealSlotCard
          key={s.key}
          date={date}
          slot={s.key}
          meal={mealFor(s.key)}
          onEdit={(slot, meal) => setEditing({ slot, meal })}
        />
      ))}

      {editing && (
        <AddMealSheet
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          date={date}
          slot={editing.slot}
          existing={editing.meal}
        />
      )}
    </div>
  );
}

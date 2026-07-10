"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: "default" | "lg";
  className?: string;
}

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  size = "lg",
  className,
}: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const btnSize = size === "lg" ? "icon-lg" : "icon";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Button
        type="button"
        variant="outline"
        size={btnSize}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label="Restar"
      >
        <Minus className={size === "lg" ? "!h-7 !w-7" : "h-4 w-4"} />
      </Button>
      <div
        className={cn(
          "min-w-[3.5rem] text-center font-bold tabular-nums",
          size === "lg" ? "text-3xl" : "text-xl"
        )}
      >
        {value}
      </div>
      <Button
        type="button"
        variant="outline"
        size={btnSize}
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label="Sumar"
      >
        <Plus className={size === "lg" ? "!h-7 !w-7" : "h-4 w-4"} />
      </Button>
    </div>
  );
}

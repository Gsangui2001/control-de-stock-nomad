import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Soft tinted badges (Linear/Notion style) instead of loud solid pills
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-primary/15 bg-primary/10 text-primary",
        secondary: "border-transparent bg-foreground/[0.06] text-foreground/70",
        destructive: "border-destructive/20 bg-destructive/10 text-destructive",
        outline: "border-border text-muted-foreground",
        success: "border-success/20 bg-success/10 text-success",
        warning: "border-warning/25 bg-warning/15 text-warning-foreground",
        accent: "border-accent/25 bg-accent/15 text-accent-foreground",
        /* Blue "planificado" state */
        info: "border-ocean/15 bg-ocean/10 text-ocean",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

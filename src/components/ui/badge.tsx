import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: "default" | "outline" | "ok" | "err" }) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        variant === "default" && "bg-secondary text-secondary-foreground",
        variant === "outline" && "border border-border text-muted-foreground",
        variant === "ok" && "bg-emerald-500/15 text-emerald-400",
        variant === "err" && "bg-red-500/15 text-red-400",
        className
      )}
      {...props}
    />
  );
}

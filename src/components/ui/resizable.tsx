import type { ComponentProps } from "react";
import * as ResizablePrimitive from "react-resizable-panels";
import { cn } from "@/lib/utils";

export const ResizablePanelGroup = ({
  className,
  ...props
}: ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup className={cn("flex h-full w-full", className)} {...props} />
);

export const ResizablePanel = ResizablePrimitive.Panel;

export function ResizableHandle({ className, ...props }: ComponentProps<typeof ResizablePrimitive.PanelResizeHandle>) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      className={cn("relative w-px bg-border data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full hover:bg-foreground/20", className)}
      {...props}
    />
  );
}

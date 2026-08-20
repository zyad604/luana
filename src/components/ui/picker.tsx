import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerOption = { id: string; name: string };

export function Picker({
  value,
  options,
  onChange,
  width = "w-44",
  dropUp = false,
  compact = false,
}: {
  value: string;
  options: PickerOption[];
  onChange: (id: string) => void;
  width?: string;
  dropUp?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value) || options[0];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex max-w-[220px] items-center gap-1 rounded-md px-2 text-xs text-foreground/80 hover:bg-white/5 hover:text-foreground",
          compact ? "h-6" : "h-7",
          open && "bg-white/5 text-foreground"
        )}
      >
        <span className="truncate">{current?.name || value}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute z-50 overflow-hidden rounded-lg border border-white/10 bg-popover p-1 shadow-2xl",
            dropUp ? "bottom-[calc(100%+6px)] left-0" : "left-0 top-[calc(100%+4px)]",
            width
          )}
        >
          <div className="max-h-64 overflow-y-auto">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent",
                  o.id === value && "bg-accent"
                )}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                <span className="truncate">{o.name}</span>
                {o.id === value ? <Check className="h-3 w-3 shrink-0" /> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

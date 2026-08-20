import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Cmd = { id: string; label: string; hint?: string; run: () => void };

export function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  commands: Cmd[];
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);
  const hits = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a command…"
          className="border-0 border-b rounded-none h-11"
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) {
              hits[0].run();
              onOpenChange(false);
            }
          }}
        />
        <div className="max-h-72 overflow-auto py-1">
          {hits.map((c) => (
            <button
              key={c.id}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                c.run();
                onOpenChange(false);
              }}
            >
              <span>{c.label}</span>
              {c.hint ? <span className="text-xs text-muted-foreground">{c.hint}</span> : null}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

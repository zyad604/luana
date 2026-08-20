import { FolderPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type FolderCard = {
  id: string;
  name: string;
  path: string;
  preview?: string;
  hasChat?: boolean;
  busy?: boolean;
};

export function FolderStack({
  folders,
  activeId,
  onSelect,
  onAdd,
  onRemove,
  title = "FOLDERS",
  addTitle = "Add folder",
  empty = "Add a folder — each one gets its own chat",
}: {
  folders: FolderCard[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  title?: string;
  addTitle?: string;
  empty?: string;
}) {
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r bg-card">
      <div className="flex h-11 items-center justify-between border-b px-3">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground">{title}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAdd} title={addTitle}>
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-2">
          {folders.length === 0 && (
            <button
              type="button"
              onClick={onAdd}
              className="rounded-xl border border-dashed px-3 py-8 text-center text-xs text-muted-foreground hover:bg-accent"
            >
              {empty}
            </button>
          )}
          {folders.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect(f.id)}
              className={cn(
                "group relative w-full rounded-xl border px-3 py-2.5 text-left shadow-sm transition",
                "hover:bg-accent/60",
                f.id === activeId ? "border-foreground/20 bg-accent" : "border-border bg-background/60",
                i === 0 && f.id === activeId && "shadow-md"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {f.busy && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" />}
                    <div className="truncate text-sm font-medium">{f.name}</div>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {f.busy ? "Working…" : f.preview || "Empty chat"}
                  </div>
                </div>
                <span
                  className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground group-hover:flex"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(f.id);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

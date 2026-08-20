import { useEffect, useState } from "react";
import { ChevronRight, File, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type Row = { name: string; path: string; dir: boolean };

export function FileTree({
  root,
  active,
  onOpen,
}: {
  root: string | null;
  active: string | null;
  onOpen: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Record<string, Row[]>>({});

  useEffect(() => {
    if (!root) return;
    setExpanded(new Set([root]));
    void load(root);
  }, [root]);

  async function load(dir: string) {
    const rows: Row[] = await window.luda.invoke("tree:list", dir);
    setChildren((c) => ({ ...c, [dir]: rows }));
  }

  function toggle(row: Row) {
    if (!row.dir) {
      onOpen(row.path);
      return;
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(row.path)) next.delete(row.path);
      else {
        next.add(row.path);
        if (!children[row.path]) void load(row.path);
      }
      return next;
    });
  }

  function render(dir: string, depth: number) {
    const rows = children[dir] || [];
    return rows.map((row) => {
      const open = expanded.has(row.path);
      return (
        <div key={row.path}>
          <button
            onClick={() => toggle(row)}
            className={cn(
              "flex w-full items-center gap-1.5 truncate rounded-sm px-2 py-1 text-left text-[13px] hover:bg-accent",
              active === row.path && "bg-accent text-accent-foreground"
            )}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            {row.dir ? (
              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition", open && "rotate-90")} />
            ) : (
              <span className="w-3.5" />
            )}
            {row.dir ? <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500/80" /> : <File className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />}
            <span className="truncate">{row.name}</span>
          </button>
          {row.dir && open ? render(row.path, depth + 1) : null}
        </div>
      );
    });
  }

  if (!root) return <p className="px-3 py-2 text-xs text-muted-foreground">Open a folder</p>;
  return <ScrollArea className="h-full">{render(root, 0)}</ScrollArea>;
}

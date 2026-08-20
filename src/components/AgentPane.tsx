import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type AgentItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; id: string; name: string; preview?: string; ok?: boolean; done: boolean }
  | { kind: "phase"; title: string }
  | { kind: "error"; message: string };

export function AgentPane({
  items,
  busy,
  hasKey,
  model,
  workflows,
  onSend,
  onCancel,
  onRunWorkflow,
}: {
  items: AgentItem[];
  busy: boolean;
  hasKey: boolean;
  model: string;
  workflows: { name: string; description: string }[];
  onSend: (text: string) => void;
  onCancel: () => void;
  onRunWorkflow: (name: string, goal: string) => void;
}) {
  const [text, setText] = useState("");
  const [wf, setWf] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [items, busy]);

  function submit() {
    const t = text.trim();
    if (!t || busy) return;
    if (wf) {
      onRunWorkflow(wf, t);
      setWf("");
    } else onSend(t);
    setText("");
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 items-center justify-between border-b px-3">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground">AGENT</span>
        <Badge variant="outline">{model}</Badge>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3 text-sm">
          {!hasKey && (
            <p className="text-xs text-muted-foreground">
              Add <code className="text-foreground">XAI_API_KEY</code> to <code className="text-foreground">.env</code> next to Luda.
            </p>
          )}
          {items.length === 0 && hasKey && (
            <p className="text-xs leading-5 text-muted-foreground">
              Ask Luda to read, patch, test. Tools: glob, grep, read, edit, write, apply_patch, bash, todo. Workflows run a short phase pipeline instead of nested agents.
            </p>
          )}
          {items.map((it, i) => (
            <div key={i}>
              {it.kind === "user" && (
                <div className="rounded-md border bg-background px-3 py-2 whitespace-pre-wrap">{it.text}</div>
              )}
              {it.kind === "assistant" && (
                <div className="whitespace-pre-wrap text-[13px] leading-5 text-foreground/90">{it.text}</div>
              )}
              {it.kind === "tool" && (
                <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <Badge variant={it.done ? (it.ok ? "ok" : "err") : "outline"}>{it.name}</Badge>
                  <span className="truncate">{it.preview || (it.done ? "" : "running…")}</span>
                </div>
              )}
              {it.kind === "phase" && (
                <div className="text-[11px] font-medium tracking-wide text-amber-400/90">{it.title}</div>
              )}
              {it.kind === "error" && <div className="text-xs text-red-400">{it.message}</div>}
            </div>
          ))}
          <div ref={end} />
        </div>
      </ScrollArea>
      <div className="border-t p-2">
        <div className="mb-2 flex items-center gap-2">
          <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={wf}
            onChange={(e) => setWf(e.target.value)}
            className="h-7 flex-1 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">chat (default)</option>
            {workflows.map((w) => (
              <option key={w.name} value={w.name}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={wf ? "Goal for this workflow…" : "Ask Luda to edit the repo…"}
            className="pr-10"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button
            size="icon"
            className={cn("absolute bottom-2 right-2 h-7 w-7")}
            onClick={busy ? onCancel : submit}
            disabled={!busy && !text.trim()}
          >
            {busy ? <Square className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <p className="mt-1 px-1 text-[10px] text-muted-foreground">Ctrl+Enter to send</p>
      </div>
    </div>
  );
}

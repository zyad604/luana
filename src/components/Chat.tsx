import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronRight, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AgentItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; id: string; name: string; preview?: string; ok?: boolean; done: boolean; status?: string }
  | { kind: "thought"; text: string }
  | { kind: "plan"; entries: { content?: string; status?: string }[] }
  | { kind: "compact"; text: string }
  | { kind: "phase"; title: string }
  | { kind: "error"; message: string };

export function Chat({
  items,
  busy,
  grokOk,
  folderName,
  onSend,
  onCancel,
}: {
  items: AgentItem[];
  busy: boolean;
  grokOk: boolean;
  folderName?: string | null;
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const pinBottom = useRef(true);

  function isNearBottom(el: HTMLDivElement) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  }

  function stickIfPinned() {
    const el = scroller.current;
    if (!el || !pinBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }

  useEffect(() => {
    stickIfPinned();
  }, [items, busy]);

  function submit() {
    const t = text.trim();
    if (!t || busy) return;
    pinBottom.current = true;
    onSend(t);
    setText("");
    requestAnimationFrame(stickIfPinned);
  }

  const empty = items.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={() => {
          const el = scroller.current;
          if (!el) return;
          pinBottom.current = isNearBottom(el);
        }}
        onWheel={() => {
          const el = scroller.current;
          if (!el) return;
          requestAnimationFrame(() => {
            if (el) pinBottom.current = isNearBottom(el);
          });
        }}
      >
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-sky-500 text-lg font-bold text-zinc-950">
              L
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{folderName || "Luda"}</h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {folderName && folderName !== "Chat"
                ? `This is ${folderName}.`
                : "Normal chat up here. Switch to Code for project folders."}
            </p>
            {!grokOk && (
              <p className="mt-4 max-w-md text-xs text-muted-foreground">
                Grok CLI not found. In PowerShell: <code className="text-foreground">irm https://x.ai/cli/install.ps1 | iex</code>
              </p>
            )}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
            {items.map((it, i) => (
              <div key={i} className="select-text">
                {it.kind === "user" && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-secondary px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap">
                      {it.text}
                    </div>
                  </div>
                )}
                {it.kind === "thought" && (
                  <ThoughtBlock
                    text={it.text}
                    live={busy && i === items.length - 1}
                  />
                )}
                {it.kind === "assistant" && (
                  <div className="text-[15px] leading-7 whitespace-pre-wrap text-foreground/90">{it.text}</div>
                )}
                {it.kind === "tool" && (
                  <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                    <Badge variant={it.done ? (it.ok === false ? "err" : "ok") : "outline"}>{it.name}</Badge>
                    <span className="truncate">{it.preview || it.status || (it.done ? "done" : "running…")}</span>
                  </div>
                )}
                {it.kind === "plan" && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {(it.entries || []).map((e, j) => (
                      <div key={j}>
                        {e.status === "completed" ? "✓" : "•"} {e.content || ""}
                      </div>
                    ))}
                  </div>
                )}
                {it.kind === "compact" && (
                  <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    {it.text.split("\n")[0] || "Grok compact"}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                {it.kind === "phase" && (
                  <div className="text-[11px] font-medium tracking-wide text-amber-400/90">{it.title}</div>
                )}
                {it.kind === "error" && <div className="text-sm text-red-400">{it.message}</div>}
              </div>
            ))}
            {busy && items[items.length - 1]?.kind === "user" && (
              <div className="text-sm text-muted-foreground">Thinking…</div>
            )}
          </div>
        )}
      </div>

      <div className={cn("mx-auto w-full max-w-2xl px-4", empty ? "pb-16" : "pb-4")}>
        <div className="rounded-2xl border bg-card p-2 shadow-lg">
          <Textarea
            ref={box}
            value={text}
            rows={empty ? 3 : 2}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message Luda…"
            className="min-h-[56px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[11px] text-muted-foreground">Enter to send · Shift+Enter for newline</span>
            <Button size="icon" className="h-8 w-8 rounded-full" onClick={busy ? onCancel : submit} disabled={!busy && !text.trim()}>
              {busy ? <Square className="h-3.5 w-3.5" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThoughtBlock({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="select-text">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} />
        <span>{live ? "Thinking…" : "Thought"}</span>
      </button>
      {open && (
        <div className="ml-5 mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap text-[12px] leading-5 text-muted-foreground/80">
          {text}
        </div>
      )}
    </div>
  );
}

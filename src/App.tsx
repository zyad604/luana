import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Files, Minus, Plus, Square, Terminal as TermIcon, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { FileTree } from "@/components/FileTree";
import { Chat, type AgentItem } from "@/components/Chat";
import { TerminalPane } from "@/components/TerminalPane";
import { CommandPalette } from "@/components/CommandPalette";
import { Picker } from "@/components/ui/picker";
import { FolderStack, type FolderCard } from "@/components/FolderStack";
import { baseName, cn } from "@/lib/utils";

const FALLBACK_MODELS = [
  { id: "grok-4.6", name: "Grok 4.6" },
  { id: "grok-4.5", name: "Grok 4.5" },
];
const FALLBACK_EFFORTS = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
  { id: "xhigh", name: "Extra high" },
];

type ThreadState = {
  items: AgentItem[];
  grokSessionId: string | null;
  busy: boolean;
};

function emptyThread(): ThreadState {
  return { items: [], grokSessionId: null, busy: false };
}

function previewFrom(items: AgentItem[]) {
  const last = [...(items || [])].reverse().find((i) => i.kind === "user" || i.kind === "assistant");
  if (!last || !("text" in last) || !last.text) return "";
  return String(last.text).replace(/\s+/g, " ").slice(0, 72);
}

export default function App() {
  const [mode, setMode] = useState<"chat" | "code">("chat");
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderCard[]>([]);
  const [chats, setChats] = useState<FolderCard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ThreadState>>({});
  const [grokOk, setGrokOk] = useState(false);
  const [model, setModel] = useState("grok-4.6");
  const [effort, setEffort] = useState("xhigh");
  const [models, setModels] = useState<{ id: string; name: string }[]>(FALLBACK_MODELS);
  const [efforts, setEfforts] = useState(FALLBACK_EFFORTS);
  const [filesOn, setFilesOn] = useState(false);
  const [termOn, setTermOn] = useState(false);
  const [palette, setPalette] = useState(false);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const saveTimers = useRef<Record<string, number>>({});

  function patchThread(id: string, fn: (cur: ThreadState) => ThreadState) {
    setThreads((prev) => {
      const next = fn(prev[id] || emptyThread());
      const all = { ...prev, [id]: next };
      threadsRef.current = all;
      scheduleSave(id, next);
      return all;
    });
  }

  function scheduleSave(id: string, t: ThreadState) {
    window.clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = window.setTimeout(() => {
      void window.luda.invoke("chat:save", { folderId: id, items: t.items, grokSessionId: t.grokSessionId });
    }, 400);
  }

  async function hydrate(id: string, chat?: { items?: AgentItem[]; grokSessionId?: string | null }) {
    if (!id) return;
    if (threadsRef.current[id]) return;
    const data = chat || (await window.luda.invoke("chat:load", id));
    setThreads((prev) => {
      if (prev[id]) return prev;
      const next = {
        ...prev,
        [id]: {
          items: data.items || [],
          grokSessionId: data.grokSessionId || null,
          busy: Boolean(prev[id]?.busy),
        },
      };
      threadsRef.current = next;
      return next;
    });
  }

  const boot = useCallback(async () => {
    const st = await window.luda.invoke("app:state");
    setGrokOk(Boolean(st.grok));
    setModel(st.model || "grok-4.6");
    setEffort(st.effort || "xhigh");
    setEfforts(st.efforts || FALLBACK_EFFORTS);
    const lib = st.library || (await window.luda.invoke("library:list"));
    setFolders(lib.folders || []);
    setChats(lib.chats || []);
    const startMode = lib.mode === "code" ? "code" : "chat";
    setMode(startMode);
    const startId = startMode === "code" ? lib.activeFolderId : lib.activeChatId;
    if (startId) {
      setActiveId(startId);
      const chat = await window.luda.invoke("chat:load", startId);
      setThreads((prev) => {
        const next = {
          ...prev,
          [startId]: {
            items: chat.items || [],
            grokSessionId: chat.grokSessionId || null,
            busy: (st.busyIds || []).includes(startId),
          },
        };
        threadsRef.current = next;
        return next;
      });
      if (startMode === "code") {
        const f = (lib.folders || []).find((x: FolderCard) => x.id === startId);
        if (f) setWorkspace(f.path);
      }
    } else if (st.workspace) setWorkspace(st.workspace);
    const list = await window.luda.invoke("models:list");
    if (list?.models?.length) setModels(list.models);
    setGrokOk(Boolean(list?.grok || st.grok));
    if (list?.defaultId) setModel(list.defaultId);
  }, []);

  useEffect(() => {
    void boot();
    const offWs = window.luda.on("workspace:changed", (d) => {
      const payload = d as { workspace: string; library?: { folders: FolderCard[]; activeFolderId: string | null } };
      setWorkspace(payload.workspace);
      if (payload.library) setFolders(payload.library.folders || []);
    });
    const offAgent = window.luda.on("agent:event", (raw) => {
      const ev = raw as {
        type: string;
        text?: string;
        id?: string;
        name?: string;
        preview?: string;
        ok?: boolean;
        title?: string;
        message?: string;
        status?: string;
        folderId?: string;
        sessionId?: string;
        entries?: { content?: string; status?: string }[];
      };
      const id = ev.folderId || activeIdRef.current;
      if (!id) return;
      patchThread(id, (cur) => {
        const items = applyAgentEvent(cur.items, ev);
        const busy = ev.type === "done" ? false : ev.type === "user" ? true : cur.busy;
        return {
          items,
          grokSessionId: ev.sessionId || cur.grokSessionId,
          busy,
        };
      });
    });
    return () => {
      offWs();
      offAgent();
    };
  }, [boot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPalette(true);
      } else if (meta && e.key === "`") {
        e.preventDefault();
        setTermOn((v) => !v);
      } else if (meta && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setFilesOn((v) => !v);
      } else if (meta && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void addFolder();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const live = activeId ? threads[activeId] || emptyThread() : emptyThread();

  function applyPicked(picked: {
    library?: { folders: FolderCard[]; chats?: FolderCard[] };
    folder: FolderCard | null;
    chat?: { items?: AgentItem[]; grokSessionId?: string | null };
  }) {
    if (picked.library) {
      setFolders(picked.library.folders || []);
      setChats(picked.library.chats || []);
    }
    if (picked.folder) {
      setActiveId(picked.folder.id);
      setWorkspace(picked.folder.path || null);
      const lift = (list: FolderCard[]) => {
        const rest = list.filter((f) => f.id !== picked.folder!.id);
        return [picked.folder!, ...rest];
      };
      if (picked.folder.path) setFolders(lift);
      else setChats(lift);
      const id = picked.folder.id;
      if (!threadsRef.current[id]) {
        setThreads((prev) => {
          const next = {
            ...prev,
            [id]: {
              items: picked.chat?.items || [],
              grokSessionId: picked.chat?.grokSessionId || null,
              busy: Boolean(prev[id]?.busy),
            },
          };
          threadsRef.current = next;
          return next;
        });
      }
    } else {
      setActiveId(null);
      setWorkspace(null);
    }
  }

  async function sendAgent(prompt: string) {
    let id = activeId;
    if (!id) {
      if (mode === "code") {
        const added = await window.luda.invoke("library:add");
        if (!added) return;
        applyPicked(added);
        id = added.folder?.id;
      } else {
        const added = await window.luda.invoke("chats:new");
        applyPicked({ library: added.library, folder: added.thread, chat: added.chat });
        id = added.thread?.id;
      }
    }
    if (!id) return;
    const sid = threadsRef.current[id]?.grokSessionId || null;
    patchThread(id, (cur) => ({
      ...cur,
      busy: true,
      items: [...cur.items, { kind: "user", text: prompt }],
    }));
    const res = await window.luda.invoke("agent:run", {
      prompt,
      model,
      effort,
      grokSessionId: sid,
      threadId: id,
    });
    if (res?.sessionId) {
      patchThread(id, (cur) => ({ ...cur, grokSessionId: res.sessionId }));
    }
    if (res?.error) {
      patchThread(id, (cur) => ({ ...cur, busy: false }));
    }
  }

  async function selectFolder(id: string) {
    if (activeId === id) return;
    const current = activeId ? threadsRef.current[activeId] : null;
    if (activeId && current) {
      await window.luda.invoke("chat:save", {
        folderId: activeId,
        items: current.items,
        grokSessionId: current.grokSessionId,
      });
    }
    if (mode === "chat") {
      const picked = await window.luda.invoke("chats:select", id);
      setActiveId(id);
      setWorkspace(null);
      await hydrate(id, picked.chat);
      return;
    }
    const picked = await window.luda.invoke("library:select", id);
    setActiveId(id);
    setWorkspace(picked.folder?.path || null);
    await hydrate(id, picked.chat);
  }

  async function addFolder() {
    const current = activeId ? threadsRef.current[activeId] : null;
    if (activeId && current) {
      await window.luda.invoke("chat:save", {
        folderId: activeId,
        items: current.items,
        grokSessionId: current.grokSessionId,
      });
    }
    if (mode === "chat") {
      const added = await window.luda.invoke("chats:new");
      applyPicked({ library: added.library, folder: added.thread, chat: added.chat });
      return;
    }
    const added = await window.luda.invoke("library:add");
    if (!added) return;
    applyPicked(added);
  }

  async function resetActive() {
    if (!activeId) {
      await addFolder();
      return;
    }
    if (mode === "chat") {
      await addFolder();
      return;
    }
    await window.luda.invoke("agent:cancel", activeId);
    await window.luda.invoke("agent:reset", activeId);
    patchThread(activeId, () => emptyThread());
    await window.luda.invoke("chat:save", { folderId: activeId, items: [], grokSessionId: null });
  }

  async function removeFolder(id: string) {
    if (mode === "chat") {
      const res = await window.luda.invoke("chats:remove", id);
      setThreads((prev) => {
        const next = { ...prev };
        delete next[id];
        threadsRef.current = next;
        return next;
      });
      applyPicked({ library: res.library, folder: res.thread, chat: res.chat });
      return;
    }
    const res = await window.luda.invoke("library:remove", id);
    setThreads((prev) => {
      const next = { ...prev };
      delete next[id];
      threadsRef.current = next;
      return next;
    });
    applyPicked(res);
  }

  async function switchMode(next: "chat" | "code") {
    if (next === mode) return;
    const current = activeId ? threadsRef.current[activeId] : null;
    if (activeId && current) {
      await window.luda.invoke("chat:save", {
        folderId: activeId,
        items: current.items,
        grokSessionId: current.grokSessionId,
      });
    }
    const res = await window.luda.invoke("library:mode", next);
    setMode(next);
    setFilesOn(false);
    setTermOn(false);
    if (res.library) {
      setFolders(res.library.folders || []);
      setChats(res.library.chats || []);
    }
    if (next === "code") {
      applyPicked({ library: res.library, folder: res.folder, chat: res.chat });
    } else {
      const thread = res.thread;
      applyPicked({
        library: res.library,
        folder: thread ? { id: thread.id, name: thread.name, path: "" } : null,
        chat: res.chat,
      });
    }
  }

  const stacked = (mode === "code" ? folders : chats).map((f) => {
    const t = threads[f.id];
    return {
      ...f,
      busy: Boolean(t?.busy),
      preview: t ? previewFrom(t.items) || f.preview : f.preview,
    };
  });

  const commands = useMemo(
    () => [
      { id: "open", label: mode === "code" ? "Add folder" : "New chat", run: () => void addFolder() },
      { id: "new", label: "New chat", hint: "Ctrl+N", run: () => void addFolder() },
      { id: "term", label: "Toggle Terminal", hint: "Ctrl+`", run: () => setTermOn((v) => !v) },
      { id: "files", label: "Toggle Files", hint: "Ctrl+B", run: () => setFilesOn((v) => !v) },
    ],
    [mode]
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex h-full flex-col bg-background">
        <header className="titlebar-drag flex h-11 shrink-0 items-center border-b">
          <div className="titlebar-no-drag flex items-center gap-0.5 pl-2">
            <div className="mr-1 grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-amber-400 to-sky-500 text-[11px] font-bold text-zinc-950">
              L
            </div>
            <div className="mr-1 flex rounded-md border p-0.5">
              <button
                type="button"
                className={cn("rounded px-2 py-0.5 text-xs", mode === "chat" ? "bg-accent" : "text-muted-foreground")}
                onClick={() => void switchMode("chat")}
              >
                Chat
              </button>
              <button
                type="button"
                className={cn("rounded px-2 py-0.5 text-xs", mode === "code" ? "bg-accent" : "text-muted-foreground")}
                onClick={() => void switchMode("code")}
              >
                Code
              </button>
            </div>
            {mode === "code" && (
              <span className="max-w-[140px] truncate px-2 text-xs text-muted-foreground">
                {workspace ? baseName(workspace) : "No folder"}
              </span>
            )}
            <Picker value={model} options={models} onChange={(id) => { setModel(id); void window.luda.invoke("models:set", id); }} width="w-52" />
            <Picker value={effort} options={efforts} onChange={(id) => { setEffort(id); void window.luda.invoke("effort:set", id); }} width="w-36" />
          </div>

          <div className="flex-1" />

          <div className="titlebar-no-drag flex items-center pr-0">
            <TopBtn active={false} label="New" onClick={() => void (mode === "chat" ? addFolder() : resetActive())}>
              <Plus className="h-4 w-4" />
            </TopBtn>
            {mode === "code" && (
              <>
                <TopBtn active={filesOn} label="Files" onClick={() => setFilesOn((v) => !v)}>
                  <Files className="h-4 w-4" />
                </TopBtn>
                <TopBtn active={termOn} label="Terminal" onClick={() => setTermOn((v) => !v)}>
                  <TermIcon className="h-4 w-4" />
                </TopBtn>
              </>
            )}
            <div className="ml-1 flex h-11">
              <button className="w-11 hover:bg-accent" onClick={() => window.luda.invoke("window:action", "min")}>
                <Minus className="mx-auto h-3.5 w-3.5" />
              </button>
              <button className="w-11 hover:bg-accent" onClick={() => window.luda.invoke("window:action", "max")}>
                <Square className="mx-auto h-3 w-3" />
              </button>
              <button className="w-11 hover:bg-red-600 hover:text-white" onClick={() => window.luda.invoke("window:action", "close")}>
                <X className="mx-auto h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <FolderStack
            folders={stacked}
            activeId={activeId}
            onSelect={(id) => void selectFolder(id)}
            onAdd={() => void addFolder()}
            onRemove={(id) => void removeFolder(id)}
            title={mode === "code" ? "FOLDERS" : "CHATS"}
            addTitle={mode === "code" ? "Add folder" : "New chat"}
            empty={mode === "code" ? "Add a project folder — each one has its own coding chat" : "New chat to start talking"}
          />
          <div className="relative min-h-0 min-w-0 flex-1">
          <Chat
            items={live.items}
            busy={live.busy}
            grokOk={grokOk}
            folderName={stacked.find((f) => f.id === activeId)?.name || (mode === "code" ? "Code" : "Chat")}
            onSend={(t) => void sendAgent(t)}
            onCancel={() => void window.luda.invoke("agent:cancel", activeId)}
          />

          {mode === "code" && filesOn && (
            <aside className="absolute inset-y-0 left-0 z-20 w-72 border-r bg-background/95 shadow-xl backdrop-blur">
              <div className="flex h-9 items-center justify-between border-b px-3 text-[11px] tracking-wide text-muted-foreground">
                FILES
                <button onClick={() => setFilesOn(false)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="h-[calc(100%-36px)]">
                {workspace ? (
                  <FileTree root={workspace} active={null} onOpen={() => undefined} />
                ) : (
                  <div className="space-y-2 p-3">
                    <p className="text-xs text-muted-foreground">Open a folder for grok to edit the repo.</p>
                    <Button size="sm" onClick={() => void addFolder()}>
                      Add folder
                    </Button>
                  </div>
                )}
              </div>
            </aside>
          )}

          {mode === "code" && termOn && (
            <div className="absolute inset-x-0 bottom-0 z-20 h-[38%] border-t bg-background shadow-2xl">
              <div className="flex h-8 items-center justify-between px-3 text-[11px] tracking-wide text-muted-foreground">
                TERMINAL
                <button onClick={() => setTermOn(false)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="h-[calc(100%-32px)]">
                <TerminalPane workspace={workspace} />
              </div>
            </div>
          )}
          </div>
        </div>

        <footer className="flex h-6 shrink-0 items-center gap-3 border-t px-3 text-[11px] text-muted-foreground">
          <span>{grokOk ? "grok cli" : "grok cli missing"}</span>
          <span className="truncate">{workspace || "no folder"}</span>
          {Object.values(threads).filter((t) => t.busy).length > 1 && (
            <span className="text-amber-400">{Object.values(threads).filter((t) => t.busy).length} running</span>
          )}
          <span className="ml-auto">{model} · {efforts.find((e) => e.id === effort)?.name || effort}</span>
        </footer>
        <CommandPalette open={palette} onOpenChange={setPalette} commands={commands} />
      </div>
    </TooltipProvider>
  );
}

function TopBtn({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("gap-1.5", active && "bg-accent")} onClick={onClick}>
          {children}
          <span className="text-xs">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function applyAgentEvent(
  prev: AgentItem[],
  ev: {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    preview?: string;
    ok?: boolean;
    title?: string;
    message?: string;
    status?: string;
    entries?: { content?: string; status?: string }[];
  }
): AgentItem[] {
  if (ev.type === "user" && ev.text) {
    const last = prev[prev.length - 1];
    if (last && last.kind === "user" && last.text === ev.text) return prev;
    return [...prev, { kind: "user", text: ev.text }];
  }
  if (ev.type === "thought" && ev.text) {
    const last = prev[prev.length - 1];
    if (last && last.kind === "thought") {
      return [...prev.slice(0, -1), { kind: "thought", text: last.text + ev.text }];
    }
    return [...prev, { kind: "thought", text: ev.text }];
  }
  if (ev.type === "text" && ev.text) {
    const last = prev[prev.length - 1];
    if (last && last.kind === "assistant") {
      return [...prev.slice(0, -1), { kind: "assistant", text: last.text + ev.text }];
    }
    return [...prev, { kind: "assistant", text: ev.text }];
  }
  if (ev.type === "tool" && ev.id) {
    const item = {
      kind: "tool" as const,
      id: ev.id,
      name: ev.name || "tool",
      preview: ev.preview,
      status: ev.status || "pending",
      done: ev.status === "completed" || ev.status === "failed",
      ok: ev.status !== "failed",
    };
    const idx = prev.findIndex((it) => it.kind === "tool" && it.id === ev.id);
    if (idx >= 0) {
      const next = prev.slice();
      const old = next[idx] as Extract<AgentItem, { kind: "tool" }>;
      next[idx] = {
        ...old,
        ...item,
        name: item.name && item.name !== "tool" ? item.name : old.name,
        preview: item.preview || old.preview,
      };
      return next;
    }
    return [...prev, item];
  }
  if (ev.type === "plan") {
    return [...prev, { kind: "plan", entries: ev.entries || [] }];
  }
  if (ev.type === "compact") {
    return [...prev, { kind: "compact", text: ev.text || "Context compacted" }];
  }
  if (ev.type === "phase" && ev.title) return [...prev, { kind: "phase", title: ev.title }];
  if (ev.type === "error" && ev.message) return [...prev, { kind: "error", message: ev.message }];
  return prev;
}

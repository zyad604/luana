import { useEffect, useState, type ReactNode } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AppSettings = {
  displayName: string;
  accent: string;
  density: string;
  glow: boolean;
  showFooter: boolean;
};

export type SkillCard = {
  id: string;
  name: string;
  description: string;
  body: string;
  path?: string;
};

const ACCENTS = [
  { id: "amber", name: "Amber" },
  { id: "sky", name: "Sky" },
  { id: "violet", name: "Violet" },
  { id: "rose", name: "Rose" },
  { id: "emerald", name: "Emerald" },
  { id: "zinc", name: "Zinc" },
];

const emptySkill = (): SkillCard => ({ id: "", name: "", description: "", body: "" });

export function Settings({
  open,
  settings,
  onClose,
  onSave,
}: {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (next: AppSettings) => void;
}) {
  const [tab, setTab] = useState<"look" | "skills">("look");
  const [draft, setDraft] = useState(settings);
  const [skills, setSkills] = useState<SkillCard[]>([]);
  const [edit, setEdit] = useState<SkillCard>(emptySkill());
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setErr("");
      void refreshSkills();
    }
  }, [open, settings]);

  async function refreshSkills() {
    const list = await window.luda.invoke("skills:list");
    setSkills(list || []);
  }

  async function saveSkill() {
    setErr("");
    try {
      await window.luda.invoke("skills:save", edit);
      setEdit(emptySkill());
      await refreshSkills();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteSkill(id: string) {
    if (!window.confirm("Delete skill “" + id + "”? Grok will stop seeing it.")) return;
    await window.luda.invoke("skills:remove", id);
    if (edit.id === id) setEdit(emptySkill());
    await refreshSkills();
  }

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-[2px]">
      <aside className="titlebar-no-drag flex h-full w-[420px] max-w-full flex-col border-l border-white/10 bg-[hsl(var(--card))] shadow-2xl">
        <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
          <span className="text-sm font-medium">Settings</span>
          <button type="button" className="rounded-md p-1 hover:bg-white/5" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-1 border-b border-white/10 px-3 py-2">
          <TabBtn active={tab === "look"} onClick={() => setTab("look")}>
            Look
          </TabBtn>
          <TabBtn active={tab === "skills"} onClick={() => setTab("skills")}>
            Skills
          </TabBtn>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "look" && (
            <div className="space-y-5">
              <Field label="Display name">
                <input
                  value={draft.displayName}
                  maxLength={32}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                  className="field"
                />
              </Field>
              <Field label="Accent">
                <div className="flex flex-wrap gap-2">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      title={a.name}
                      onClick={() => setDraft({ ...draft, accent: a.id })}
                      className={cn(
                        "h-7 w-7 rounded-full ring-offset-2 ring-offset-[hsl(var(--card))]",
                        draft.accent === a.id && "ring-2 ring-white"
                      )}
                      style={{ background: swatch(a.id) }}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Density">
                <div className="flex gap-2">
                  {["comfortable", "compact"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={cn("chip", draft.density === d && "chip-on")}
                      onClick={() => setDraft({ ...draft, density: d })}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </Field>
              <label className="flex items-center justify-between text-sm">
                Composer glow
                <input
                  type="checkbox"
                  checked={draft.glow}
                  onChange={(e) => setDraft({ ...draft, glow: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                Status bar
                <input
                  type="checkbox"
                  checked={draft.showFooter}
                  onChange={(e) => setDraft({ ...draft, showFooter: e.target.checked })}
                />
              </label>
              <Button
                className="w-full"
                onClick={() => {
                  onSave(draft);
                  onClose();
                }}
              >
                Save look
              </Button>
            </div>
          )}

          {tab === "skills" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Custom Grok skills. Saved to <code className="text-foreground/80">~/.grok/skills</code> so the CLI loads them.
              </p>
              <div className="space-y-1">
                {skills.length === 0 && <p className="text-xs text-muted-foreground">No custom skills yet.</p>}
                {skills.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-left hover:bg-white/5",
                      edit.id === s.id && "border-white/20 bg-white/5"
                    )}
                    onClick={() => setEdit({ ...s })}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{s.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{s.description || "/" + s.id}</div>
                    </div>
                    <span
                      className="rounded p-1 text-muted-foreground hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteSkill(s.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>

              <div className="space-y-2 rounded-xl border border-white/10 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  {edit.id ? "Edit " + edit.id : "New skill"}
                </div>
                <input
                  className="field"
                  placeholder="name (slash command)"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value, id: edit.id || "" })}
                />
                <input
                  className="field"
                  placeholder="when to use this"
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
                <textarea
                  className="field min-h-[140px] font-mono text-xs"
                  placeholder={"# Instructions\n\nSteps grok should follow…"}
                  value={edit.body}
                  onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                />
                {err && <p className="text-xs text-red-400">{err}</p>}
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => void saveSkill()} disabled={!edit.name.trim()}>
                    Save skill
                  </Button>
                  <Button variant="ghost" onClick={() => setEdit(emptySkill())}>
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-md px-3 py-1 text-xs", active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      {children}
    </button>
  );
}

function swatch(id: string) {
  return (
    {
      amber: "#f5a524",
      sky: "#38bdf8",
      violet: "#a78bfa",
      rose: "#fb7185",
      emerald: "#34d399",
      zinc: "#a1a1aa",
    } as Record<string, string>
  )[id] || "#f5a524";
}

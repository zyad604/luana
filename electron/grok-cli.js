"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const EFFORTS = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
  { id: "xhigh", name: "Extra high" },
];

let selectedModel = "grok-4.6";
let selectedEffort = "xhigh";
let liveModels = null;
let liveEfforts = EFFORTS.slice();

function grokBin() {
  const p = path.join(os.homedir(), ".grok", "bin", "grok.exe");
  if (fs.existsSync(p)) return p;
  const w = spawnSync("where.exe", ["grok"], { encoding: "utf8", windowsHide: true });
  const hit = (w.stdout || "").split(/\r?\n/).map((s) => s.trim()).find((s) => s && fs.existsSync(s));
  return hit || null;
}

function modelName() {
  return selectedModel;
}
function effortName() {
  return selectedEffort;
}
function setModel(id) {
  if (id && id !== "luda") selectedModel = String(id);
  return selectedModel;
}
function setEffort(id) {
  const ok = EFFORTS.some((e) => e.id === id);
  if (ok) selectedEffort = id;
  return selectedEffort;
}

function parseModels(text) {
  const models = [];
  let defaultId = "grok-4.6";
  for (const line of String(text || "").split(/\r?\n/)) {
    const star = line.match(/^\s*\*\s+(\S+)/);
    const dash = line.match(/^\s*-\s+(\S+)/);
    const id = (star || dash)?.[1];
    if (!id || id === "luda") continue;
    if (star || /\(default\)/i.test(line)) defaultId = id;
    if (!models.some((m) => m.id === id)) models.push({ id, name: prettyModel(id) });
  }
  if (!models.length) {
    models.push({ id: "grok-4.6", name: "Grok 4.6" }, { id: "grok-4.5", name: "Grok 4.5" });
  }
  return { models, defaultId, loggedIn: /logged in/i.test(text) };
}

function prettyModel(id) {
  return id.replace(/^grok-/, "Grok ").replace(/-/g, " ");
}

function applyModelState(state) {
  if (!state || typeof state !== "object") return;
  if (state.currentModelId) selectedModel = state.currentModelId;
  if (Array.isArray(state.availableModels) && state.availableModels.length) {
    liveModels = state.availableModels
      .map((m) => ({ id: m.modelId || m.id, name: m.name || prettyModel(m.modelId || m.id) }))
      .filter((m) => m.id && m.id !== "luda");
    const meta = state.availableModels[0] && state.availableModels[0]._meta;
    if (meta && Array.isArray(meta.reasoningEfforts) && meta.reasoningEfforts.length) {
      liveEfforts = meta.reasoningEfforts.map((e) => ({
        id: e.id || e.value,
        name: String(e.label || e.id || "").replace(/\s*effort$/i, "").trim() || e.id,
      }));
      if (meta.reasoningEffort) selectedEffort = meta.reasoningEffort;
    }
  }
}

function getEfforts() {
  return liveEfforts;
}

function listModels() {
  if (liveModels && liveModels.length) {
    return { models: liveModels, defaultId: selectedModel, loggedIn: true, grok: grokBin() };
  }
  const bin = grokBin();
  if (!bin) return { models: [], defaultId: "grok-4.6", loggedIn: false, grok: null };
  const r = spawnSync(bin, ["models"], { encoding: "utf8", windowsHide: true, timeout: 20000 });
  const text = (r.stdout || "") + "\n" + (r.stderr || "");
  const parsed = parseModels(text);
  if (!selectedModel || selectedModel === "luda") selectedModel = parsed.defaultId;
  return { ...parsed, grok: bin };
}

function stripLudaModelFromGrokConfig() {
  const file = path.join(os.homedir(), ".grok", "config.toml");
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, "utf8");
  const next = text.replace(/\n?# Luda desktop[\s\S]*?(?=\n\[|\s*$)/, "\n").replace(/\n\[model\.luda\][\s\S]*?(?=\n\[|\s*$)/, "\n");
  if (next !== text) fs.writeFileSync(file, next.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n", "utf8");
}

module.exports = {
  EFFORTS,
  grokBin,
  listModels,
  modelName,
  effortName,
  setModel,
  setEffort,
  getEfforts,
  applyModelState,
  stripLudaModelFromGrokConfig,
};

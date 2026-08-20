"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { grokBin, applyModelState } = require("./grok-cli");

const pool = new Map();

function loadUserRules(cwd) {
  const files = [
    path.join(os.homedir(), ".luda", "app.md"),
    path.join(os.homedir(), ".luda", "AGENTS.md"),
    path.join(os.homedir(), ".claude", "CLAUDE.md"),
    path.join(os.homedir(), ".claude", "CLAUDE.local.md"),
    path.join(os.homedir(), ".grok", "AGENTS.md"),
    path.join(os.homedir(), "AGENTS.md"),
  ];
  if (cwd) {
    files.push(path.join(cwd, ".claude", "CLAUDE.md"), path.join(cwd, "CLAUDE.md"), path.join(cwd, "AGENTS.md"));
  }
  const seen = new Set();
  const parts = [];
  for (const f of files) {
    const key = path.resolve(f).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (!fs.existsSync(f)) continue;
      const t = fs.readFileSync(f, "utf8").trim();
      if (t) parts.push("# " + path.basename(f) + "\n# " + f + "\n\n" + t);
    } catch {
      /* skip */
    }
  }
  return parts.join("\n\n---\n\n");
}

function sessionMeta(cwd) {
  const meta = { yoloMode: true };
  const rules = loadUserRules(cwd);
  if (rules) meta.rules = rules;
  return meta;
}

class Agent {
  constructor(threadId) {
    this.threadId = threadId;
    this.proc = null;
    this.buf = "";
    this.errBuf = "";
    this.nextId = 1;
    this.pending = new Map();
    this.sessionId = null;
    this.startedWith = { model: null, effort: null, cwd: null };
    this.emitFn = () => {};
    this.cancelFlag = () => false;
    this.stopping = false;
    this.gen = 0;
    this.promptsSinceCompact = 0;
    this.muteEmit = false;
    this.lastCompactAt = 0;
    this.usageMethod = null;
    this.compactMethod = null;
    this.busy = false;
  }

  stop() {
    this.stopping = true;
    this.gen += 1;
    this.busy = false;
    for (const [, p] of this.pending) {
      try {
        p.reject(new Error("cancelled"));
      } catch {
        /* ignore */
      }
    }
    this.pending.clear();
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        /* ignore */
      }
    }
    this.proc = null;
    this.buf = "";
    this.errBuf = "";
    this.sessionId = null;
    this.startedWith = { model: null, effort: null, cwd: null };
    this.promptsSinceCompact = 0;
    this.muteEmit = false;
    this.usageMethod = null;
    this.compactMethod = null;
  }

  send(obj) {
    if (!this.proc || !this.proc.stdin || this.proc.stdin.destroyed) {
      throw new Error("grok agent is not running");
    }
    this.proc.stdin.write(JSON.stringify(obj) + "\n");
  }

  rpc(method, params, timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const ms =
        timeoutMs != null
          ? timeoutMs
          : method === "session/prompt"
            ? 0
            : /compact/i.test(method)
              ? 180000
              : 25000;
      const timer = ms
        ? setTimeout(() => {
            this.pending.delete(id);
            reject(new Error("grok agent timeout: " + method));
          }, ms)
        : null;
      this.pending.set(id, {
        resolve: (v) => {
          if (timer) clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          if (timer) clearTimeout(timer);
          reject(e);
        },
      });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  respond(id, result) {
    this.send({ jsonrpc: "2.0", id, result });
  }

  eatStdout(chunk) {
    this.buf += chunk.toString("utf8");
    const lines = this.buf.split(/\r?\n/);
    this.buf = lines.pop() || "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("{")) continue;
      let msg;
      try {
        msg = JSON.parse(s);
      } catch {
        continue;
      }
      this.onMessage(msg);
    }
  }

  emitCompact() {
    const now = Date.now();
    if (now - this.lastCompactAt < 4000) return;
    this.lastCompactAt = now;
    this.emitFn({ type: "compact", text: "Grok compact" });
  }

  onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.method === "session/update") {
      this.forwardUpdate(msg.params || {});
      return;
    }
    if (msg.method === "x.ai/session_notification" || msg.method === "_x.ai/session_notification") {
      const blob = JSON.stringify(msg.params || {});
      if (/compact/i.test(blob)) this.emitCompact();
      return;
    }
    if (msg.method === "session/request_permission") {
      const options = (msg.params && msg.params.options) || [];
      const always = options.find((o) => /always|allow_always/i.test(o.optionId || o.kind || ""));
      const once = options.find((o) => /allow/i.test(o.optionId || o.kind || ""));
      const optionId = (always || once || options[0] || {}).optionId || "allow-once";
      if (msg.id != null) this.respond(msg.id, { outcome: { outcome: "selected", optionId } });
      return;
    }
    if (msg.method === "fs/read_text_file" && msg.id != null) {
      try {
        const p = msg.params.path;
        const content = fs.readFileSync(p, "utf8");
        this.respond(msg.id, { content });
      } catch (err) {
        this.send({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: err.message } });
      }
      return;
    }
    if (msg.method === "fs/write_text_file" && msg.id != null) {
      try {
        fs.mkdirSync(path.dirname(msg.params.path), { recursive: true });
        fs.writeFileSync(msg.params.path, msg.params.content ?? "", "utf8");
        this.respond(msg.id, {});
      } catch (err) {
        this.send({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: err.message } });
      }
      return;
    }
    if (msg.id != null && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else p.resolve(msg.result || {});
    }
  }

  toolPreview(u) {
    const input = u.rawInput || u.input || {};
    const raw =
      input.command ||
      input.path ||
      input.target_file ||
      input.file_path ||
      input.pattern ||
      input.query ||
      input.prompt ||
      u.title ||
      "";
    return String(raw).replace(/\s+/g, " ").slice(0, 180);
  }

  chunkText(u) {
    if (typeof u.data === "string") return u.data;
    if (typeof u.text === "string") return u.text;
    const c = u.content;
    if (typeof c === "string") return c;
    if (c && typeof c.text === "string") return c.text;
    return "";
  }

  forwardUpdate(params) {
    const u = params.update || params;
    const kind = u.sessionUpdate || u.type || u.subtype || "";
    if (/compact/i.test(kind) || kind === "compact_boundary") {
      this.emitCompact();
      return;
    }
    if (this.muteEmit) return;
    if (kind === "agent_message_chunk" || kind === "text" || kind === "assistant") {
      const t = this.chunkText(u);
      if (t) this.emitFn({ type: "text", text: t });
      return;
    }
    if (kind === "agent_thought_chunk" || kind === "thought" || kind === "thinking" || kind === "reasoning") {
      const t = this.chunkText(u);
      if (t) this.emitFn({ type: "thought", text: t });
      return;
    }
    if (kind === "tool_call") {
      this.emitFn({
        type: "tool",
        id: u.toolCallId || u.toolCallID,
        name: u.title || u.toolName || u.kind || "tool",
        preview: this.toolPreview(u),
        status: u.status || "pending",
      });
      return;
    }
    if (kind === "tool_call_update") {
      this.emitFn({
        type: "tool",
        id: u.toolCallId || u.toolCallID,
        name: u.title || u.toolName || u.kind || "tool",
        preview: this.toolPreview(u),
        status: u.status || "in_progress",
      });
      return;
    }
    if (kind === "plan") {
      this.emitFn({ type: "plan", entries: u.entries || u.plan || [] });
    }
  }

  needRestart(model, effort, cwd) {
    return (
      !this.proc ||
      this.startedWith.model !== model ||
      this.startedWith.effort !== effort ||
      this.startedWith.cwd !== (cwd || "") ||
      !this.sessionId
    );
  }

  async ensureAgent({ model, effort, cwd, grokSessionId, emit, isCancelled }) {
    this.emitFn = emit || this.emitFn;
    this.cancelFlag = isCancelled || this.cancelFlag;
    const bin = grokBin();
    if (!bin) throw new Error("grok CLI not found. Install: irm https://x.ai/cli/install.ps1 | iex");
    if (!this.needRestart(model, effort, cwd)) return;
    this.stop();
    this.stopping = false;
    this.emitFn = emit || this.emitFn;
    await this.startAgent({ model, effort, cwd, grokSessionId });
  }

  startAgent({ model, effort, cwd, grokSessionId }) {
    const bin = grokBin();
    const args = [
      "--rules",
      "Obey " + path.join(os.homedir(), ".luda", "app.md") + " on every reply. That file is the Luda agent. Same format, same voice, no exceptions.",
      "agent",
      "--always-approve",
      "--no-leader",
    ];
    if (model) args.push("-m", model);
    if (effort) args.push("--effort", effort);
    args.push("stdio");
    const work = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
    this.proc = spawn(bin, args, { cwd: work, windowsHide: true, env: { ...process.env } });
    const my = ++this.gen;
    this.startedWith = { model: model || null, effort: effort || null, cwd: cwd || "" };
    this.buf = "";
    this.errBuf = "";
    this.nextId = 1;
    this.proc.stdout.on("data", (c) => this.eatStdout(c));
    this.proc.stderr.on("data", (c) => {
      this.errBuf += c.toString("utf8");
      if (this.errBuf.length > 8000) this.errBuf = this.errBuf.slice(-4000);
    });
    this.proc.on("error", (err) => {
      if (my !== this.gen) return;
      this.failPending(err);
      this.proc = null;
      this.busy = false;
    });
    this.proc.on("close", () => {
      if (my !== this.gen) return;
      if (!this.stopping) this.failPending(new Error(this.cleanErr(this.errBuf) || "grok agent exited"));
      this.proc = null;
      this.sessionId = null;
      this.stopping = false;
      this.busy = false;
    });
    return this.initialize(work, grokSessionId);
  }

  failPending(err) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  cleanErr(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("{") && !/signature|input_tokens|total_cost/i.test(l))
      .slice(-4)
      .join(" ")
      .slice(0, 240);
  }

  async initialize(cwd, grokSessionId) {
    const init = await this.rpc("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
      },
      clientInfo: { name: "luda", version: "1.3.0" },
    });
    if (init && init._meta && init._meta.modelState) applyModelState(init._meta.modelState);
    if (grokSessionId) {
      try {
        const loaded = await this.rpc("session/load", { sessionId: grokSessionId, cwd });
        this.sessionId = loaded.sessionId || loaded.session_id || grokSessionId;
        if (this.sessionId) return;
      } catch {
        /* new session */
      }
    }
    const created = await this.rpc("session/new", {
      cwd,
      mcpServers: [],
      _meta: sessionMeta(cwd),
    });
    this.sessionId = created.sessionId || created.session_id;
    if (!this.sessionId) throw new Error("grok agent did not return a session");
  }

  async newChat() {
    if (!this.proc || !this.proc.stdin) {
      this.sessionId = null;
      return;
    }
    const cwd =
      this.startedWith.cwd && fs.existsSync(this.startedWith.cwd) ? this.startedWith.cwd : os.homedir();
    const created = await this.rpc("session/new", {
      cwd,
      mcpServers: [],
      _meta: sessionMeta(cwd),
    });
    this.sessionId = created.sessionId || created.session_id;
    this.promptsSinceCompact = 0;
  }

  async cancel() {
    try {
      if (this.proc && this.sessionId) await this.rpc("session/cancel", { sessionId: this.sessionId });
    } catch {
      this.stop();
    }
  }

  async runPrompt({ prompt, cwd, model, effort, grokSessionId, emit, isCancelled }) {
    await this.ensureAgent({ model, effort, cwd, grokSessionId, emit, isCancelled });
    this.emitFn = emit;
    this.cancelFlag = isCancelled || (() => false);
    if (!prompt) throw new Error("empty prompt");
    this.busy = true;
    try {
      const slash = String(prompt).trim();
      if (/^\/compact(?:\s|$)/i.test(slash)) {
        const note = slash.replace(/^\/compact\s*/i, "").trim();
        const ok = await this.grokCompact(note);
        if (ok) this.emitCompact();
        return { text: "", sessionId: this.sessionId, compacted: ok };
      }
      const result = await this.rpc("session/prompt", {
        sessionId: this.sessionId,
        prompt: [{ type: "text", text: String(prompt) }],
      });
      this.promptsSinceCompact += 1;
      const compacted = await this.maybeCompactSession();
      if (compacted) this.emitCompact();
      return { text: "", sessionId: this.sessionId, result, compacted };
    } finally {
      this.busy = false;
    }
  }

  async getUsage() {
    if (!this.sessionId) return null;
    if (this.usageMethod === false) return null;
    if (this.usageMethod) {
      try {
        return await this.rpc(this.usageMethod, { sessionId: this.sessionId }, 6000);
      } catch {
        this.usageMethod = null;
      }
    }
    const methods = [
      "x.ai/session/usage",
      "x.ai/session/info",
      "_x.ai/session/usage",
      "_x.ai/session/info",
      "_x.ai/session/state",
    ];
    for (const method of methods) {
      try {
        const result = await this.rpc(method, { sessionId: this.sessionId }, 4000);
        this.usageMethod = method;
        return result;
      } catch {
        /* try next */
      }
    }
    this.usageMethod = false;
    return null;
  }

  async grokCompact(note) {
    if (!this.sessionId) return false;
    this.muteEmit = true;
    const extra = note ? { context: note } : {};
    const slash = note ? "/compact " + note : "/compact";
    try {
      if (this.compactMethod === "session/prompt") {
        await this.rpc("session/prompt", {
          sessionId: this.sessionId,
          prompt: [{ type: "text", text: slash }],
        });
        this.promptsSinceCompact = 0;
        return true;
      }
      if (this.compactMethod) {
        try {
          await this.rpc(this.compactMethod, { sessionId: this.sessionId, ...extra }, 180000);
          this.promptsSinceCompact = 0;
          return true;
        } catch {
          this.compactMethod = null;
        }
      }
      const attempts = [
        ["x.ai/compact_conversation", { sessionId: this.sessionId, ...extra }, 180000],
        ["x.ai/compact_conversation", { session_id: this.sessionId, ...extra }, 8000],
        ["_x.ai/compact_conversation", { sessionId: this.sessionId, ...extra }, 8000],
        ["session/compact", { sessionId: this.sessionId, ...extra }, 8000],
      ];
      for (const [method, params, ms] of attempts) {
        try {
          await this.rpc(method, params, ms);
          this.compactMethod = method;
          this.promptsSinceCompact = 0;
          return true;
        } catch {
          /* next */
        }
      }
      await this.rpc("session/prompt", {
        sessionId: this.sessionId,
        prompt: [{ type: "text", text: slash }],
      });
      this.compactMethod = "session/prompt";
      this.promptsSinceCompact = 0;
      return true;
    } catch {
      return false;
    } finally {
      this.muteEmit = false;
    }
  }

  async maybeCompactSession() {
    const { usagePercent } = require("./compact");
    const usage = await this.getUsage();
    const pct = usagePercent(usage);
    const due = pct >= 55 || (!usage && this.promptsSinceCompact >= 8);
    if (!due) return false;
    return this.grokCompact();
  }
}

function key(threadId) {
  return String(threadId || "default");
}

function get(threadId) {
  const id = key(threadId);
  if (!pool.has(id)) pool.set(id, new Agent(id));
  return pool.get(id);
}

async function runPrompt(opts) {
  return get(opts.threadId).runPrompt(opts);
}

async function newChat(threadId) {
  const a = pool.get(key(threadId));
  if (a) return a.newChat();
}

async function cancel(threadId) {
  const a = pool.get(key(threadId));
  if (a) return a.cancel();
}

function stop(threadId) {
  if (threadId == null || threadId === true) {
    for (const a of pool.values()) a.stop();
    pool.clear();
    return;
  }
  const id = key(threadId);
  const a = pool.get(id);
  if (a) {
    a.stop();
    pool.delete(id);
  }
}

function isBusy(threadId) {
  const a = pool.get(key(threadId));
  return Boolean(a && a.busy);
}

function busyIds() {
  const ids = [];
  for (const [id, a] of pool) {
    if (a.busy) ids.push(id);
  }
  return ids;
}

module.exports = { runPrompt, newChat, cancel, stop, grokCompact: (note, threadId) => get(threadId).grokCompact(note), getUsage: (threadId) => get(threadId).getUsage(), isBusy, busyIds };

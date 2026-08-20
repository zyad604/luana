"use strict";

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { loadEnv } = require("./env");
const { IGNORE, walkFiles } = require("./agent/paths");
const {
  runAgent,
  modelName,
  setModel,
  setEffort,
  effortName,
  resetSession,
  killCurrent,
  cancelRun,
  busyIds,
  isBusy,
} = require("./agent/loop");
const {
  listModels,
  grokBin,
  getEfforts,
  stripLudaModelFromGrokConfig,
} = require("./grok-cli");
const { startBridge, stopBridge } = require("./bridge");
const library = require("./library");

const APP_ROOT = path.resolve(__dirname, "..");
let mainWindow = null;
let workspace = null;
const shells = new Map();
let shellSeq = 1;
const running = new Set();
let bridgeServer = null;
let modelCache = [];

loadEnv(
  APP_ROOT,
  app.getPath("userData"),
  app.isPackaged ? path.dirname(process.execPath) : null
);

function statePath() {
  return path.join(app.getPath("userData"), "state.json");
}
function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return { recents: [], lastWorkspace: null };
  }
}
function writeState(partial) {
  const cur = { ...readState(), ...partial };
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(cur, null, 2));
}

function parseLaunchArgs() {
  const raw = process.argv;
  const dash = raw.indexOf("--");
  const args = dash >= 0 ? raw.slice(dash + 1) : raw.slice(app.isPackaged ? 1 : 2);
  const out = { goto: null, paths: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--goto") out.goto = args[++i];
    else if (a && !a.startsWith("-")) out.paths.push(path.resolve(a));
  }
  return out;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#09090b",
    frame: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const index = path.join(APP_ROOT, "out", "index.html");
  if (devUrl) win.loadURL(devUrl);
  else if (fs.existsSync(index)) win.loadFile(index);
  else win.loadURL("http://127.0.0.1:5173");
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
    for (const rec of shells.values()) {
      try {
        rec.proc.kill();
      } catch {
        /* ignore */
      }
    }
    shells.clear();
  });
  return win;
}

function listDir(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const rows = [];
  for (const name of names) {
    if (IGNORE.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.lstatSync(full);
    } catch {
      continue;
    }
    rows.push({ name, path: full, dir: st.isDirectory(), size: st.isFile() ? st.size : 0 });
  }
  rows.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return rows;
}

function langFrom(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".js": "javascript",
    ".cjs": "javascript",
    ".mjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".jsx": "javascript",
    ".json": "json",
    ".html": "html",
    ".css": "css",
    ".md": "markdown",
    ".py": "python",
    ".ps1": "powershell",
    ".jsonc": "json",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".rs": "rust",
    ".go": "go",
    ".sql": "sql",
  };
  return map[ext] || "plaintext";
}

function emitAgent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("agent:event", payload);
}

function openWorkspace(dir) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error("not a folder: " + abs);
  workspace = abs;
  const st = readState();
  const recents = [abs, ...(st.recents || []).filter((p) => p !== abs)].slice(0, 12);
  writeState({ lastWorkspace: abs, recents });
  try {
    library.addFolder(abs);
  } catch {
    /* ignore */
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("workspace:changed", { workspace: abs, library: library.listLibrary() });
    mainWindow.setTitle("Luda — " + path.basename(abs));
  }
  return { workspace: abs, name: path.basename(abs) };
}

function registerIpc() {
  ipcMain.handle("app:state", () => {
    const st = readState();
    const lib = library.seedFromRecents(st.recents || []);
    return {
      workspace,
      recents: st.recents || [],
      platform: process.platform,
      grok: Boolean(grokBin()),
      grokPath: grokBin(),
      model: modelName(),
      effort: effortName(),
      efforts: getEfforts(),
      models: modelCache,
      agentBusy: running.size > 0,
      busyIds: busyIds(),
      bridge: "http://127.0.0.1:17380",
      library: lib,
      mode: lib.mode || "chat",
    };
  });

  ipcMain.handle("library:list", () => library.listLibrary());
  ipcMain.handle("library:mode", (_e, mode) => {
    const lib = library.setMode(mode);
    if (mode === "code" && lib.activeFolderId) {
      const picked = library.selectFolder(lib.activeFolderId);
      openWorkspace(picked.folder.path);
      return { library: lib, folder: picked.folder, chat: picked.chat, mode: "code" };
    }
    workspace = null;
    const thread = library.activeThread();
    return {
      library: lib,
      folder: null,
      thread,
      chat: thread ? library.loadChat(thread.id) : { items: [], grokSessionId: null },
      mode: "chat",
    };
  });
  ipcMain.handle("chats:new", () => {
    workspace = null;
    return library.addChat();
  });
  ipcMain.handle("chats:select", (_e, id) => {
    workspace = null;
    return library.selectChat(id);
  });
  ipcMain.handle("chats:remove", (_e, id) => {
    killCurrent(id);
    running.delete(id);
    workspace = null;
    return library.removeChat(id);
  });
  ipcMain.handle("library:add", async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const res = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths[0]) return null;
    const folder = library.addFolder(res.filePaths[0]);
    openWorkspace(folder.path);
    return { library: library.listLibrary(), folder, chat: library.loadChat(folder.id) };
  });
  ipcMain.handle("library:select", (_e, id) => {
    const picked = library.selectFolder(id);
    openWorkspace(picked.folder.path);
    return picked;
  });
  ipcMain.handle("library:remove", (_e, id) => {
    killCurrent(id);
    running.delete(id);
    const lib = library.removeFolder(id);
    if (lib.activeFolderId) {
      const picked = library.selectFolder(lib.activeFolderId);
      openWorkspace(picked.folder.path);
      return { library: lib, ...picked };
    }
    workspace = null;
    return { library: lib, folder: null, chat: { items: [], grokSessionId: null } };
  });
  ipcMain.handle("chat:save", (_e, payload) => library.saveChat(payload.folderId, payload));
  ipcMain.handle("chat:load", (_e, folderId) => library.loadChat(folderId));

  ipcMain.handle("models:list", () => {
    const listed = listModels();
    modelCache = listed.models;
    return { models: listed.models, defaultId: listed.defaultId, loggedIn: listed.loggedIn, grok: listed.grok };
  });
  ipcMain.handle("models:set", (_e, id) => setModel(id));
  ipcMain.handle("effort:set", (_e, id) => setEffort(id));
  ipcMain.handle("agent:reset", (_e, threadId) => {
    const id = threadId || (library.activeThread() && library.activeThread().id);
    resetSession(id);
    return { ok: true, threadId: id };
  });
  ipcMain.handle("agent:status", () => ({ busyIds: busyIds(), running: [...running] }));

  ipcMain.handle("window:action", (_e, action) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (!win) return;
    if (action === "min") win.minimize();
    else if (action === "max") win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === "close") win.close();
  });

  ipcMain.handle("folder:openDialog", async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const res = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths[0]) return null;
    return openWorkspace(res.filePaths[0]);
  });

  ipcMain.handle("folder:open", (_e, dir) => openWorkspace(dir));
  ipcMain.handle("tree:list", (_e, dir) => listDir(dir || workspace || ""));
  ipcMain.handle("files:search", (_e, query) => {
    if (!workspace || !query) return [];
    const all = [];
    walkFiles(workspace, all, 4000);
    const q = String(query).toLowerCase();
    return all
      .filter((p) => path.basename(p).toLowerCase().includes(q))
      .slice(0, 60)
      .map((p) => ({ path: p, name: path.basename(p), rel: path.relative(workspace, p) }));
  });

  ipcMain.handle("file:read", (_e, filePath) => {
    const st = fs.statSync(filePath);
    if (st.size > 2_000_000) return { error: "file too large", path: filePath, language: langFrom(filePath) };
    const buf = fs.readFileSync(filePath);
    if (buf.includes(0)) return { error: "binary file", path: filePath, language: "plaintext" };
    return {
      path: filePath,
      name: path.basename(filePath),
      content: buf.toString("utf8"),
      language: langFrom(filePath),
    };
  });

  ipcMain.handle("file:write", (_e, { filePath, content }) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    return { ok: true, path: filePath };
  });

  ipcMain.handle("file:reveal", (_e, filePath) => shell.showItemInFolder(filePath));

  ipcMain.handle("cursor:open", (_e, target) => {
    const p = target || workspace || APP_ROOT;
    const cmd = "C:\\Program Files\\cursor\\resources\\app\\bin\\cursor.cmd";
    spawn(fs.existsSync(cmd) ? cmd : "cursor.cmd", [p], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      shell: true,
    }).unref();
    return { ok: true, path: p };
  });

  ipcMain.handle("shell:start", (e, cwd) => {
    const id = String(shellSeq++);
    const dir = cwd || workspace || os.homedir();
    const proc = spawn("powershell.exe", ["-NoLogo", "-NoExit"], {
      cwd: dir,
      env: process.env,
      windowsHide: true,
    });
    shells.set(id, { proc, cwd: dir });
    const send = (data) => {
      if (!e.sender.isDestroyed()) e.sender.send("shell:data", { id, data: data.toString("utf8") });
    };
    proc.stdout.on("data", send);
    proc.stderr.on("data", send);
    proc.on("close", (code) => {
      send(`\r\n[exit ${code}]\r\n`);
      shells.delete(id);
      if (!e.sender.isDestroyed()) e.sender.send("shell:exit", { id, code });
    });
    return { id, cwd: dir };
  });
  ipcMain.handle("shell:write", (_e, { id, data }) => {
    const rec = shells.get(id);
    if (!rec) return { ok: false };
    rec.proc.stdin.write(data);
    return { ok: true };
  });
  ipcMain.handle("shell:kill", (_e, id) => {
    const rec = shells.get(id);
    if (rec) {
      try {
        rec.proc.kill();
      } catch {
        /* ignore */
      }
      shells.delete(id);
    }
    return { ok: true };
  });

  ipcMain.handle("agent:cancel", (_e, threadId) => {
    const id = threadId || (library.activeThread() && library.activeThread().id);
    if (id) {
      cancelRun(id);
      running.delete(id);
    }
    return { ok: true, threadId: id };
  });

  ipcMain.handle("agent:run", (_e, payload) => handleAgentRun(payload));
}

async function handleAgentRun(payload) {
  loadEnv(
    APP_ROOT,
    app.getPath("userData"),
    app.isPackaged ? path.dirname(process.execPath) : null
  );
  const thread = payload.threadId
    ? library.threadById(payload.threadId) || library.activeThread()
    : library.activeThread();
  if (!thread) return { error: "no chat" };
  if (running.has(thread.id) || isBusy(thread.id)) return { error: "this chat is already running" };
  if (running.size >= 8) return { error: "too many chats running (max 8)" };
  if (payload.cwd && thread.kind === "code" && !workspace) {
    try {
      openWorkspace(payload.cwd);
    } catch {
      /* ignore */
    }
  }
  running.add(thread.id);
  const cwd = thread.kind === "code" && thread.cwd ? thread.cwd : os.homedir();
  const emit = (ev) => {
    emitAgent({ ...ev, folderId: thread.id });
    if (payload.onDelta && ev.type === "text" && ev.text) payload.onDelta(ev.text);
  };
  try {
    const res = await runAgent({
      threadId: thread.id,
      workspace: cwd,
      prompt: payload.prompt,
      model: payload.model || modelName(),
      effort: payload.effort || effortName(),
      grokSessionId: payload.grokSessionId,
      emit,
      isCancelled: () => !running.has(thread.id),
    });
    if (res.sessionId) library.saveChat(thread.id, { grokSessionId: res.sessionId });
    emit({ type: "done", sessionId: res.sessionId });
    return { ok: true, text: res.text, steps: res.steps, sessionId: res.sessionId, folderId: thread.id };
  } catch (err) {
    if (!running.has(thread.id)) {
      emit({ type: "done" });
      return { ok: true, cancelled: true, folderId: thread.id };
    }
    emit({ type: "error", message: err.message || String(err) });
    emit({ type: "done" });
    return { error: err.message || String(err), text: err.message || String(err), folderId: thread.id };
  } finally {
    running.delete(thread.id);
  }
}

function applyLaunch(win, launch) {
  let dir = null;
  let file = null;
  for (const p of launch.paths) {
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) dir = p;
      else if (st.isFile()) {
        file = p;
        dir = dir || path.dirname(p);
      }
    } catch {
      /* skip */
    }
  }
  if (!dir) {
    const last = readState().lastWorkspace;
    if (last && fs.existsSync(last)) dir = last;
  }
  if (dir) openWorkspace(dir);
  win.webContents.once("did-finish-load", () => {
    if (dir) win.webContents.send("workspace:changed", { workspace: dir });
    if (file) win.webContents.send("file:open", { path: file, goto: launch.goto });
  });
}

function focusMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  registerIpc();
  stripLudaModelFromGrokConfig();
  const listed = listModels();
  modelCache = listed.models;
  if (listed.defaultId) setModel(listed.defaultId);
  mainWindow = createWindow();
  applyLaunch(mainWindow, parseLaunchArgs());
  try {
    const b = await startBridge({
      status: () => ({ workspace, model: modelName(), effort: effortName(), busy: running.size > 0 }),
      models: async () => {
        const listedNow = listModels();
        modelCache = listedNow.models;
        return modelCache;
      },
      prompt: async (opts) => {
        focusMain();
        emitAgent({ type: "user", text: opts.prompt, source: opts.source || "cli" });
        return handleAgentRun({
          prompt: opts.prompt,
          model: opts.model,
          cwd: opts.cwd,
          history: opts.history,
          onDelta: opts.onDelta,
        });
      },
    });
    bridgeServer = b.server;
  } catch (err) {
    console.error("luda bridge:", err.message || err);
  }
});

app.on("before-quit", () => {
  killCurrent();
  stopBridge(bridgeServer);
});
app.on("window-all-closed", () => {
  killCurrent();
  stopBridge(bridgeServer);
  if (process.platform !== "darwin") app.quit();
});

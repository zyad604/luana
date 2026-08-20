"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

function rootDir() {
  const d = path.join(os.homedir(), ".luda");
  fs.mkdirSync(path.join(d, "chats"), { recursive: true });
  return d;
}

function libFile() {
  return path.join(rootDir(), "library.json");
}

function chatFile(id) {
  return path.join(rootDir(), "chats", id + ".json");
}

function readLib() {
  try {
    return normalize(JSON.parse(fs.readFileSync(libFile(), "utf8")));
  } catch {
    return normalize({ folders: [], chats: [], activeFolderId: null, activeChatId: null, mode: "chat" });
  }
}

function normalize(lib) {
  if (!Array.isArray(lib.folders)) lib.folders = [];
  if (!Array.isArray(lib.chats)) lib.chats = [];
  if (lib.mode !== "code") lib.mode = "chat";
  return lib;
}

function writeLib(lib) {
  fs.mkdirSync(rootDir(), { recursive: true });
  fs.writeFileSync(libFile(), JSON.stringify(lib, null, 2), "utf8");
}

function loadChat(folderId) {
  try {
    const data = JSON.parse(fs.readFileSync(chatFile(folderId), "utf8"));
    return {
      folderId,
      items: Array.isArray(data.items) ? data.items : [],
      grokSessionId: data.grokSessionId || null,
    };
  } catch {
    return { folderId, items: [], grokSessionId: null };
  }
}

function lastPreview(items) {
  const last = [...(items || [])].reverse().find((i) => i.kind === "user" || i.kind === "assistant");
  if (!last || !last.text) return "";
  return String(last.text).replace(/\s+/g, " ").slice(0, 72);
}

function decorate(row) {
  const chat = loadChat(row.id);
  return {
    ...row,
    preview: lastPreview(chat.items),
    hasChat: chat.items.length > 0,
  };
}

function titleFromItems(items, fallback) {
  const first = (items || []).find((i) => i.kind === "user" && i.text);
  if (!first) return fallback;
  return String(first.text).replace(/\s+/g, " ").slice(0, 42);
}

function listLibrary() {
  const lib = readLib();
  return {
    mode: lib.mode,
    activeFolderId: lib.activeFolderId,
    activeChatId: lib.activeChatId,
    folders: lib.folders.map(decorate),
    chats: lib.chats.map(decorate),
  };
}

function setMode(mode) {
  const lib = readLib();
  lib.mode = mode === "code" ? "code" : "chat";
  if (lib.mode === "chat" && !lib.activeChatId) ensureChat(lib);
  writeLib(lib);
  return listLibrary();
}

function addFolder(dirPath) {
  const abs = path.resolve(dirPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error("not a folder");
  const lib = readLib();
  const hit = lib.folders.find((f) => f.path.toLowerCase() === abs.toLowerCase());
  if (hit) {
    lib.folders = [hit, ...lib.folders.filter((f) => f.id !== hit.id)];
    lib.activeFolderId = hit.id;
    hit.updatedAt = Date.now();
    writeLib(lib);
    return decorate(hit);
  }
  const folder = {
    id: crypto.randomUUID(),
    name: path.basename(abs),
    path: abs,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  lib.folders.unshift(folder);
  lib.activeFolderId = folder.id;
  lib.mode = "code";
  writeLib(lib);
  return decorate(folder);
}

function selectFolder(id) {
  const lib = readLib();
  const folder = lib.folders.find((f) => f.id === id);
  if (!folder) throw new Error("folder not found");
  folder.updatedAt = Date.now();
  lib.folders = [folder, ...lib.folders.filter((f) => f.id !== id)];
  lib.activeFolderId = id;
  lib.mode = "code";
  writeLib(lib);
  return { folder: decorate(folder), chat: loadChat(id) };
}

function removeFolder(id) {
  const lib = readLib();
  lib.folders = lib.folders.filter((f) => f.id !== id);
  if (lib.activeFolderId === id) lib.activeFolderId = lib.folders[0] ? lib.folders[0].id : null;
  writeLib(lib);
  try {
    fs.unlinkSync(chatFile(id));
  } catch {
    /* ignore */
  }
  return listLibrary();
}

function bump(lib, listKey, id, items) {
  const row = lib[listKey].find((f) => f.id === id);
  if (!row) return;
  row.updatedAt = Date.now();
  if (listKey === "chats") {
    const named = titleFromItems(items, row.name);
    if (named && (row.name === "New chat" || !row.name)) row.name = named;
  }
  lib[listKey] = [row, ...lib[listKey].filter((f) => f.id !== id)];
}

function saveChat(threadId, payload) {
  if (!threadId) return;
  const prev = loadChat(threadId);
  const items = payload.items != null ? payload.items : prev.items;
  const data = {
    folderId: threadId,
    items,
    grokSessionId: payload.grokSessionId !== undefined ? payload.grokSessionId : prev.grokSessionId,
    savedAt: Date.now(),
  };
  fs.writeFileSync(chatFile(threadId), JSON.stringify(data), "utf8");
  const lib = readLib();
  bump(lib, "folders", threadId, data.items);
  bump(lib, "chats", threadId, data.items);
  writeLib(lib);
  return data;
}

function ensureChat(lib) {
  if (lib.activeChatId && lib.chats.some((c) => c.id === lib.activeChatId)) return lib.chats.find((c) => c.id === lib.activeChatId);
  const chat = {
    id: crypto.randomUUID(),
    name: "New chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  lib.chats.unshift(chat);
  lib.activeChatId = chat.id;
  return chat;
}

function addChat() {
  const lib = readLib();
  lib.mode = "chat";
  const chat = {
    id: crypto.randomUUID(),
    name: "New chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  lib.chats.unshift(chat);
  lib.activeChatId = chat.id;
  writeLib(lib);
  return { library: listLibrary(), thread: decorate(chat), chat: loadChat(chat.id) };
}

function selectChat(id) {
  const lib = readLib();
  const chat = lib.chats.find((c) => c.id === id);
  if (!chat) throw new Error("chat not found");
  chat.updatedAt = Date.now();
  lib.chats = [chat, ...lib.chats.filter((c) => c.id !== id)];
  lib.activeChatId = id;
  lib.mode = "chat";
  writeLib(lib);
  return { thread: decorate(chat), chat: loadChat(id) };
}

function removeChat(id) {
  const lib = readLib();
  lib.chats = lib.chats.filter((c) => c.id !== id);
  if (lib.activeChatId === id) lib.activeChatId = lib.chats[0] ? lib.chats[0].id : null;
  if (!lib.activeChatId) ensureChat(lib);
  writeLib(lib);
  try {
    fs.unlinkSync(chatFile(id));
  } catch {
    /* ignore */
  }
  const next = lib.chats.find((c) => c.id === lib.activeChatId);
  return {
    library: listLibrary(),
    thread: next ? decorate(next) : null,
    chat: next ? loadChat(next.id) : { items: [], grokSessionId: null },
  };
}

function seedFromRecents(recents) {
  const lib = readLib();
  if (lib.folders.length) return listLibrary();
  for (const p of recents || []) {
    try {
      if (p && fs.existsSync(p)) addFolder(p);
    } catch {
      /* ignore */
    }
  }
  return listLibrary();
}

function activeFolder() {
  const lib = readLib();
  return lib.folders.find((f) => f.id === lib.activeFolderId) || null;
}

function activeThread() {
  const lib = readLib();
  if (lib.mode === "code") {
    const f = lib.folders.find((x) => x.id === lib.activeFolderId);
    return f ? { id: f.id, kind: "code", cwd: f.path, name: f.name } : null;
  }
  if (!lib.activeChatId) {
    const c = ensureChat(lib);
    writeLib(lib);
    return { id: c.id, kind: "chat", cwd: null, name: c.name };
  }
  const c = lib.chats.find((x) => x.id === lib.activeChatId);
  return c ? { id: c.id, kind: "chat", cwd: null, name: c.name } : null;
}

function threadById(id) {
  if (!id) return null;
  const lib = readLib();
  const f = lib.folders.find((x) => x.id === id);
  if (f) return { id: f.id, kind: "code", cwd: f.path, name: f.name };
  const c = lib.chats.find((x) => x.id === id);
  if (c) return { id: c.id, kind: "chat", cwd: null, name: c.name };
  return null;
}

module.exports = {
  listLibrary,
  addFolder,
  selectFolder,
  removeFolder,
  addChat,
  selectChat,
  removeChat,
  setMode,
  saveChat,
  loadChat,
  seedFromRecents,
  activeFolder,
  activeThread,
  threadById,
};

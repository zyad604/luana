"use strict";

const fs = require("fs");
const path = require("path");

const IGNORE = new Set([
  "node_modules",
  ".git",
  ".luda",
  "dist",
  "out",
  "release",
  ".next",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".turbo",
  "win-unpacked",
]);

function resolveInWorkspace(workspace, raw) {
  if (!workspace) throw new Error("no workspace open");
  const rel = String(raw || "").trim();
  if (!rel) throw new Error("empty path");
  const abs = path.resolve(workspace, rel);
  const root = path.resolve(workspace);
  const relTo = path.relative(root, abs);
  if (relTo.startsWith("..") || path.isAbsolute(relTo)) {
    throw new Error("path escapes workspace: " + rel);
  }
  return abs;
}

function toRel(workspace, abs) {
  return path.relative(workspace, abs).split(path.sep).join("/");
}

function shouldSkipName(name) {
  return IGNORE.has(name);
}

function walkFiles(root, acc, cap, filterFn) {
  if (acc.length >= cap) return;
  let names;
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const name of names) {
    if (acc.length >= cap) return;
    if (shouldSkipName(name)) continue;
    const full = path.join(root, name);
    let st;
    try {
      st = fs.lstatSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, acc, cap, filterFn);
    else if (st.isFile() && (!filterFn || filterFn(full))) acc.push(full);
  }
}

module.exports = {
  IGNORE,
  resolveInWorkspace,
  toRel,
  shouldSkipName,
  walkFiles,
};

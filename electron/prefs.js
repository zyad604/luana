"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const ACCENTS = ["amber", "sky", "violet", "rose", "emerald", "zinc"];

function file() {
  const dir = path.join(os.homedir(), ".luda");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "settings.json");
}

function defaults() {
  return {
    displayName: "Luana",
    accent: "amber",
    density: "comfortable",
    glow: true,
    showFooter: true,
  };
}

function load() {
  const base = defaults();
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8"));
    if (raw && typeof raw === "object") Object.assign(base, raw);
  } catch {
    /* first run */
  }
  if (!ACCENTS.includes(base.accent)) base.accent = "amber";
  if (base.density !== "compact") base.density = "comfortable";
  base.displayName = String(base.displayName || "Luana").slice(0, 32);
  base.glow = base.glow !== false;
  base.showFooter = base.showFooter !== false;
  return base;
}

function save(partial) {
  const next = { ...load(), ...(partial || {}) };
  if (!ACCENTS.includes(next.accent)) next.accent = "amber";
  fs.writeFileSync(file(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

module.exports = { load, save, ACCENTS };

"use strict";

const fs = require("fs");
const path = require("path");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}

function loadEnv(...dirs) {
  const files = [];
  for (const d of dirs) {
    if (d) files.push(path.join(d, ".env"));
  }
  files.push(path.join(process.cwd(), ".env"));
  for (const f of files) {
    if (f && fs.existsSync(f)) parseEnvFile(f);
  }
}

module.exports = { loadEnv, parseEnvFile };

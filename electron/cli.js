#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { readBridge } = require("./bridge");

const APP_ROOT = path.resolve(__dirname, "..");
const VERSION = "1.2.0";

function help() {
  process.stdout.write(`Luda ${VERSION} — Codex-style chat GUI + grok CLI bridge

Usage:
  luda                         open the app
  luda .                       open this folder
  luda "fix the tests"         send a chat prompt to the running app
  luda -p "..."                same (grok-style headless)
  luda grok [args...]          run official grok CLI (same login as the app)

Options
  -m, --model <id>
  --install-cli
  --version
  -h, --help
`);
}

function parse(argv) {
  const out = {
    help: false,
    version: false,
    installCli: false,
    grok: false,
    grokArgs: [],
    prompt: null,
    model: null,
    paths: [],
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "--version" || a === "-v") out.version = true;
    else if (a === "--install-cli") out.installCli = true;
    else if (a === "grok") {
      out.grok = true;
      out.grokArgs = args.slice(i + 1);
      break;
    } else if (a === "-p" || a === "--single" || a === "--prompt") out.prompt = args[++i];
    else if (a === "-m" || a === "--model") out.model = args[++i];
    else if (a.startsWith("-")) {
      process.stderr.write("unknown option: " + a + "\n");
      out.help = true;
    } else {
      const abs = path.resolve(process.cwd(), a);
      if (fs.existsSync(abs)) out.paths.push(abs);
      else if (!out.prompt) out.prompt = a;
      else out.paths.push(abs);
    }
  }
  return out;
}

function launchLuda(paths) {
  let electron;
  try {
    electron = require("electron");
  } catch {
    electron = null;
  }
  if (!electron || typeof electron !== "string") {
    const exe = path.join(os.homedir(), "Desktop", "Luda.exe");
    if (fs.existsSync(exe)) {
      spawn(exe, paths, { detached: true, stdio: "ignore", windowsHide: false }).unref();
      return;
    }
    process.stderr.write("Luda is not installed. Open the app first.\n");
    process.exit(1);
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(electron, [APP_ROOT, "--", ...paths], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    cwd: process.cwd(),
    env,
  }).unref();
}

async function waitBridge(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const b = readBridge();
    if (b && b.url) {
      try {
        const r = await fetch(b.url + "/health");
        if (r.ok) return b;
      } catch {
        /* retry */
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

async function sendPrompt(prompt, model) {
  let b = readBridge();
  if (!b) {
    launchLuda([process.cwd()]);
    b = await waitBridge(20000);
  }
  if (!b) {
    process.stderr.write("Luda app did not come up. Open Luda.exe first.\n");
    process.exit(1);
  }
  const res = await fetch(b.url + "/luda/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model, cwd: process.cwd() }),
  });
  const data = await res.json();
  if (data.error) {
    process.stderr.write(String(data.error) + os.EOL);
    process.exit(1);
  }
  process.stdout.write((data.text || "") + os.EOL);
}

function installCli() {
  const binDir = path.join(APP_ROOT, "bin");
  const ps = `
    $bin = '${binDir.replace(/'/g, "''")}'
    $cur = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ([string]::IsNullOrEmpty($cur)) { $cur = '' }
    $parts = $cur -split ';' | Where-Object { $_ -and $_.Trim() -ne '' }
    $hit = $parts | Where-Object { $_.Trim().ToLower() -eq $bin.ToLower() }
    if (-not $hit) {
      $next = if ($cur) { $cur.TrimEnd(';') + ';' + $bin } else { $bin }
      [Environment]::SetEnvironmentVariable('Path', $next, 'User')
    }
  `;
  spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
  process.stdout.write("luda CLI on PATH: " + binDir + os.EOL);
}

function grokBin() {
  const p = path.join(os.homedir(), ".grok", "bin", "grok.exe");
  if (fs.existsSync(p)) return p;
  const w = spawnSync("where.exe", ["grok"], { encoding: "utf8" });
  return (w.stdout || "").split(/\r?\n/).find(Boolean) || "grok";
}

async function main() {
  const opts = parse(process.argv);
  if (opts.help) return help();
  if (opts.version) return process.stdout.write(VERSION + os.EOL);
  if (opts.installCli) return installCli();
  if (opts.grok) {
    const child = spawn(grokBin(), opts.grokArgs, { stdio: "inherit", windowsHide: false, cwd: process.cwd() });
    child.on("exit", (c) => process.exit(c || 0));
    return;
  }
  if (opts.prompt) {
    await sendPrompt(opts.prompt, opts.model);
    return;
  }
  launchLuda(opts.paths);
}

main().catch((err) => {
  process.stderr.write(String(err.message || err) + os.EOL);
  process.exit(1);
});

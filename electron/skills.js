"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function skillsRoot() {
  const d = path.join(os.homedir(), ".grok", "skills");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function parseFront(text) {
  const m = String(text || "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { name: "", description: "", body: String(text || "").trim() };
  const yaml = m[1];
  const name = (yaml.match(/^name:\s*(.+)$/m) || [])[1] || "";
  const description = (yaml.match(/^description:\s*(.+)$/m) || [])[1] || "";
  return { name: name.trim(), description: description.trim(), body: m[2].trim() };
}

function list() {
  const root = skillsRoot();
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const dir = path.join(root, name);
    const skill = path.join(dir, "SKILL.md");
    try {
      if (!fs.statSync(dir).isDirectory() || !fs.existsSync(skill)) continue;
      const parsed = parseFront(fs.readFileSync(skill, "utf8"));
      out.push({
        id: name,
        name: parsed.name || name,
        description: parsed.description,
        body: parsed.body,
        path: skill,
      });
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function save(payload) {
  const id = slugify(payload.id || payload.name);
  if (!id) throw new Error("skill needs a name");
  const name = String(payload.name || id).trim();
  const description = String(payload.description || "").trim();
  const body = String(payload.body || "").trim() || "# " + name;
  const dir = path.join(skillsRoot(), id);
  fs.mkdirSync(dir, { recursive: true });
  const md =
    "---\nname: " +
    JSON.stringify(name) +
    "\ndescription: " +
    JSON.stringify(description) +
    "\nuser-invocable: true\n---\n\n" +
    body +
    "\n";
  fs.writeFileSync(path.join(dir, "SKILL.md"), md, "utf8");
  return list().find((s) => s.id === id);
}

function remove(id) {
  const slug = slugify(id);
  if (!slug) throw new Error("bad skill id");
  const dir = path.join(skillsRoot(), slug);
  const root = path.resolve(skillsRoot());
  const target = path.resolve(dir);
  if (!target.startsWith(root + path.sep)) throw new Error("bad skill path");
  fs.rmSync(target, { recursive: true, force: true });
  return list();
}

module.exports = { list, save, remove, skillsRoot };

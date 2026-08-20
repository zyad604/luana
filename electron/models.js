"use strict";

const FALLBACK = [
  { id: "grok-4.6", name: "Grok 4.6" },
  { id: "grok-4.5", name: "Grok 4.5" },
  { id: "grok-4.3", name: "Grok 4.3" },
  { id: "grok-4.20-0309-reasoning", name: "Grok 4.20 Reasoning" },
  { id: "grok-4.20-0309-non-reasoning", name: "Grok 4.20" },
  { id: "grok-4.20-multi-agent-0309", name: "Grok 4.20 Multi-agent" },
  { id: "grok-build-0.1", name: "Grok Build 0.1" },
  { id: "grok-3", name: "Grok 3" },
  { id: "grok-3-mini", name: "Grok 3 Mini" },
  { id: "grok-3-fast", name: "Grok 3 Fast" },
  { id: "grok-3-mini-fast", name: "Grok 3 Mini Fast" },
  { id: "grok-2", name: "Grok 2" },
  { id: "grok-2-1212", name: "Grok 2 1212" },
  { id: "grok-2-vision-1212", name: "Grok 2 Vision" },
  { id: "grok-beta", name: "Grok Beta" },
];

const SKIP = /imagine|tts|whisper|voice|realtime|image|video|embedding/i;

function label(id) {
  return id
    .replace(/^grok-/, "Grok ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchModels(apiKey) {
  if (!apiKey) return FALLBACK;
  try {
    const res = await fetch("https://api.x.ai/v1/models", {
      headers: { Authorization: "Bearer " + apiKey },
    });
    if (!res.ok) return FALLBACK;
    const data = await res.json();
    const rows = (data.data || data.models || [])
      .map((m) => (typeof m === "string" ? m : m.id))
      .filter((id) => id && /^grok/i.test(id) && !SKIP.test(id));
    const seen = new Set();
    const out = [];
    for (const id of [...rows, ...FALLBACK.map((f) => f.id)]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const fb = FALLBACK.find((f) => f.id === id);
      out.push({ id, name: fb ? fb.name : label(id) });
    }
    return out.length ? out : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

module.exports = { FALLBACK, fetchModels };

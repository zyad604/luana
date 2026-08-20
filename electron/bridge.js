"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.LUDA_BRIDGE_PORT || 17380);

function bridgeDir() {
  const d = path.join(os.homedir(), ".luda");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function bridgeFile() {
  return path.join(bridgeDir(), "bridge.json");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function startBridge(handlers) {
  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      });
      res.end();
      return;
    }
    const url = req.url.split("?")[0];
    try {
      if (req.method === "GET" && (url === "/health" || url === "/luda/health")) {
        return json(res, 200, { ok: true, app: "luda", ...handlers.status() });
      }
      if (req.method === "GET" && (url === "/v1/models" || url === "/models")) {
        const models = await handlers.models();
        return json(res, 200, {
          object: "list",
          data: models.map((m) => ({ id: m.id, object: "model", owned_by: "xai" })),
        });
      }
      if (req.method === "POST" && (url === "/luda/prompt" || url === "/prompt")) {
        const body = JSON.parse((await readBody(req)) || "{}");
        const text = body.prompt || body.message || body.input || "";
        if (!text) return json(res, 400, { error: "missing prompt" });
        const result = await handlers.prompt({
          prompt: text,
          model: body.model,
          cwd: body.cwd,
          source: "cli",
        });
        return json(res, 200, result);
      }
      if (req.method === "POST" && url === "/v1/chat/completions") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const messages = body.messages || [];
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const prompt =
          typeof lastUser?.content === "string"
            ? lastUser.content
            : Array.isArray(lastUser?.content)
              ? lastUser.content.map((c) => c.text || "").join("\n")
              : "";
        if (!prompt) return json(res, 400, { error: { message: "no user message" } });
        const stream = body.stream !== false;
        const model = body.model || handlers.status().model;
        if (stream) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
          });
          const id = "chatcmpl-luda";
          const send = (delta) => {
            res.write(
              "data: " +
                JSON.stringify({
                  id,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{ index: 0, delta, finish_reason: null }],
                }) +
                "\n\n"
            );
          };
          send({ role: "assistant" });
          const result = await handlers.prompt({
            prompt,
            model,
            source: "grok-cli",
            history: messages.filter((m) => m.role !== "system").slice(0, -1),
            onDelta: (t) => send({ content: t }),
          });
          res.write(
            "data: " +
              JSON.stringify({
                id,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              }) +
              "\n\n"
          );
          res.write("data: [DONE]\n\n");
          res.end();
          return result;
        }
        const result = await handlers.prompt({ prompt, model, source: "grok-cli", history: messages });
        return json(res, 200, {
          id: "chatcmpl-luda",
          object: "chat.completion",
          model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: result.text || "" },
              finish_reason: "stop",
            },
          ],
        });
      }
      json(res, 404, { error: "not found" });
    } catch (err) {
      if (!res.headersSent) json(res, 500, { error: err.message || String(err) });
      else res.end();
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => {
      const info = { url: `http://${HOST}:${PORT}`, pid: process.pid, port: PORT };
      fs.writeFileSync(bridgeFile(), JSON.stringify(info, null, 2));
      resolve({ server, info });
    });
  });
}

function stopBridge(server) {
  try {
    if (fs.existsSync(bridgeFile())) fs.unlinkSync(bridgeFile());
  } catch {
    /* ignore */
  }
  if (server) server.close();
}

function readBridge() {
  try {
    return JSON.parse(fs.readFileSync(bridgeFile(), "utf8"));
  } catch {
    return null;
  }
}

function connectGrokConfig() {
  const grokDir = path.join(os.homedir(), ".grok");
  fs.mkdirSync(grokDir, { recursive: true });
  const file = path.join(grokDir, "config.toml");
  let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (!/\[model\.luda\]/.test(text)) {
    text = text.replace(/\s*$/, "") + `

# Luda desktop — grok -m luda   (app must be running)
[model.luda]
model = "grok-4.6"
base_url = "http://${HOST}:${PORT}/v1"
name = "Luda"
env_key = "XAI_API_KEY"
`;
    fs.writeFileSync(file, text, "utf8");
    return { added: true, file };
  }
  return { added: false, file };
}

module.exports = { startBridge, stopBridge, readBridge, connectGrokConfig, PORT, HOST, bridgeFile };

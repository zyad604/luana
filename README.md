# Luana

its like desktop app but for Grok 
Windows. Electron + Vite + React. Talks to [Grok Build CLI](https://x.ai/grok) over ACP stdio (`grok agent --always-approve --no-leader stdio`). Same login, same models, same tools (read/edit/bash/web search) as the terminal.

Author: **Zyad ** · `zyadalmasabi@gmail.com`

---

## What you get

| Mode | What it is |
| --- | --- |
| **Chat** | Normal conversations. Left stack is chats. Home directory. |
| **Code** | Stack of project folders. Each folder has its own Grok session. Files + terminal buttons. |

- Model + reasoning-effort pickers (not the Windows native select)
- Thinking under a chevron
- Grok native `/compact` (not a homemade summarizer)
- Multiple chats run at once — switch cards, the others keep going
- Amber dot + “Working…” on a busy chat

Binary on Windows is `Luda.exe`. Repo / product name is **Luana**.

---

## Requirements

- Windows 10/11 x64
- [Node.js 18+](https://nodejs.org/) (only if you build from source)
- [Grok CLI](https://x.ai/cli) logged in to grok.com

---

## Install

### 1. Grok CLI (required)

PowerShell:

```powershell
irm https://x.ai/cli/install.ps1 | iex
grok login
grok models
```

Confirm `C:\Users\<you>\.grok\bin\grok.exe` exists and `grok models` lists grok-4.6 / grok-4.5.

### 2. Luana app

**Portable exe (easiest)**

1. Build (see [Build the exe](#build-the-exe)) or copy `release\Luda.exe`
2. Drop it on the Desktop
3. Double-click. No installer.

**From source**

```powershell
git clone https://github.com/zyad604/luana.git
cd luana
npm install
npm run dist
```

Then run `release\Luda.exe`, or during development:

```powershell
npm run dev
```

---

## How to use

1. Open Luana. Top-left: **Chat** | **Code**.
2. Pick a **model** and **effort** (low / medium / high / extra high).
3. Type in the box. Enter sends. Shift+Enter newline.

### Chat mode

- **+** or **Ctrl+N** → new chat
- Left stack → switch chats. A running chat **does not stop** when you leave it
- Square button on the composer → cancel **this** chat only
- Delete a card → kills that Grok process only

### Code mode

- **+** → add a project folder (nodo, luana, whatever)
- Each folder is its own Grok session, cwd = that folder
- **Files** → tree. **Terminal** → PowerShell in the folder
- Same parallel rule: switch folders, agents keep working

### Compact

Grok’s own compact, not a local fold.

- Type `/compact` or `/compact keep the auth details`
- Auto: after a turn if context usage ≥ 55%, plus Grok’s native 85% auto-compact

### Shortcuts

| Key | Action |
| --- | --- |
| Enter | Send |
| Shift+Enter | Newline |
| Ctrl+N | New chat |
| Ctrl+B | Files (Code) |
| Ctrl+\` | Terminal (Code) |
| Ctrl+Shift+P | Command palette |

Chats live in `%USERPROFILE%\.luda\`.

---

## Build the exe

```powershell
cd luana
npm install
npm run dist
```

Writes `release\Luda.exe`. Copy to Desktop if you want:

```powershell
Copy-Item .\release\Luda.exe $env:USERPROFILE\Desktop\Luda.exe
```

---

## How it talks to Grok

```
Luana UI  →  Electron IPC  →  grok-acp.js
                                 │
                                 ▼
              grok.exe agent --always-approve --no-leader -m <model> --effort <effort> stdio
                                 │
                                 ▼
              ACP JSON-RPC: session/new, session/prompt, session/cancel
                            x.ai/compact_conversation
```

One `grok.exe` per chat/folder (max 8 running). Switching views never kills the process.

---

## Layout

```
electron/grok-acp.js   Grok ACP client (one Agent per chat)
electron/main.js       window + IPC
electron/library.js    chats + folders under ~/.luda
src/App.tsx            Chat / Code UI
src/components/Chat.tsx
```

---

## License

MIT © zyad 

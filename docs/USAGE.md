# Luana — usage

Full install is in the [README](../README.md). This is the day-to-day map.

## First launch

1. `grok login` once in a terminal.
2. Open `Luda.exe`.
3. If the footer says `grok cli missing`, the CLI is not on PATH and not at `%USERPROFILE%\.grok\bin\grok.exe`. Re-run the [install script](https://x.ai/cli).

## Chat vs Code

**Chat** — talk. No repo. Left column is conversations.

**Code** — pick folders from disk. Grok’s cwd is that folder, so edits land in the real project.

You can flip Chat ↔ Code without stopping running agents.

## Parallel chats

Send in chat A. Click chat B. Type there too. A keeps going.

The stack shows an amber pulse and `Working…` on busy cards. Footer shows `N running` when more than one is live.

Stop is per chat (square on the composer). Closing Luana kills every grok process.

## Models

Picker in the title bar. Values come from `grok models`. Effort: low, medium, high, extra high (`xhigh`).

Each chat’s grok process is spawned with `-m` and `--effort` for that run.

## Compact

```
/compact
/compact keep the auth flow and the folder stack
```

Luana calls Grok’s `x.ai/compact_conversation`. A divider `Grok compact` shows in the thread.

## Data on disk

```
%USERPROFILE%\.luda\library.json
%USERPROFILE%\.luda\chats\<id>.json
```

Delete that folder to wipe saved chats. Grok’s own sessions stay under `%USERPROFILE%\.grok\sessions\`.

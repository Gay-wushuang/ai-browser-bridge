<p align="center">
  <img src="assets/hero.png" alt="ai-browser-bridge — drive ChatGPT, Gemini, Claude, DeepSeek, Grok, Perplexity, and Flow from your terminal through Chrome" width="640" />
</p>

# ai-browser-bridge

> Turn your signed-in ChatGPT and other web AI Conversations into sandboxed local coding agents through Chrome or Edge — no model API or raw shell required.

**English** · [עברית](README.he.md) · [Español](README.es.md) · [中文](README.zh.md)

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-browser-2EAD33?logo=playwright&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-connector-000000)

---

## Why this exists

ChatGPT is at its best in the browser — real account state, the model picker, message editing, regeneration, and conversation history all intact. Coding is at its best in the terminal, where files, tests, diffs, and patches are inspected and changed directly.

`ai-browser-bridge` connects those two surfaces. It reuses a signed-in Chrome or Edge profile,
drives the Provider's real web UI, and gives the web AI a narrow set of validated repository Tools:
`list_files`, `grep_code`, `read_file`, `apply_patch`, `run_tests`, and `git_diff`. You keep the capabilities and
Conversation history of your web subscription while local access remains inside the selected repo.

There are two local-Tool paths. `bridge agent` works through a structured text loop and does not
require a Provider MCP connector, Tunnel, model API, or local model. The interactive `/task` path
uses a Provider MCP connector and Cloudflare Tunnel where the Provider supports one. Neither path
hands the web AI a raw shell.

## Features

- **Terminal-driven ChatGPT** — send prompts and stream replies without leaving the shell; the real browser conversation stays the source of truth.
- **Web subscription to local agent** — `bridge agent` lets a signed-in web AI inspect and patch a selected repo without purchasing a separate model API.
- **Nine providers, one command** — `chatgpt`, `gemini`, `claude`, `deepseek`, `grok`, `perplexity`, `duck` ([Duck.ai](https://duck.ai/chat)), `arena` ([Arena](https://arena.ai/code/direct) — Direct/Battle/Agent/Side-by-Side + model picker), plus `flow` (Google's Veo video studio — a generation surface, not a chat). Pick one with `--provider`, or **fan out** across several (`--provider claude,deepseek,duck`) and get every reply keyed by provider in one call.
- **Built for agents** — a stable non-interactive `bridge ask … --json` contract (never hangs in a pipe) plus an outbound MCP `ask` tool, so any agent can drive a web chat.
- **Sandboxed local tools over MCP** — every file operation is validated against the selected repo root; no arbitrary shell, allowlisted test commands only.
- **Browser actions as commands** — `/resume`, `/new`, `/model`, `/rewind`, `/stop`, `/context`, `/diff`, `/compact`, and more.
- **Repo-root sessions, transcripts, and downloads** — TUI and tool-enabled runs persist under the Git working-tree root's `<repo>/.bridge/`, even when launched from a nested directory; plain `bridge ask` stays stateless and only reuses the shared Chrome profile.
- **Safety controls** — permission modes (`read-only` / `ask` / `auto`) and automatic file checkpoints around every patch.
- **Project conventions** — custom commands plus `AGENTS.md` / `CLAUDE.md` are fed to ChatGPT for `/task` runs.
- **A real composer** — prompt history, reverse search, queued prompts, and `@file` mention autocomplete.

## Architecture

```text
 terminal (you)
      │
      │  Ink / React CLI
      ▼
 orchestrator ──────────────┬───────────────────────────────┐
      │  browser automation │                   MCP server   │
      ▼  (Playwright + CDP) │                  (MCP SDK)      ▼
 ChatGPT browser UI         │                        local repo tools
      ▲                     │                     (grep/read/patch/test/diff)
      │                     ▼                                 │
      └───── Cloudflare Tunnel (cloudflared) ◄────────────────┘
              public https://…trycloudflare.com/mcp
```

Four layers, each with one job:

| Layer | Tech | Responsibility |
|-------|------|----------------|
| **CLI** | Ink / React | Terminal UI: message pane, status line, `@file` mentions, `/commands`. |
| **Browser** | Playwright + Chrome DevTools Protocol | Attaches to Chrome on the debug port and reuses one shared bridge Chrome profile. Lifecycle/status/cache code lives in `src/features/browser/`; provider selectors live under `src/features/providers/<name>/`. |
| **MCP server** | MCP SDK + Effect Schema | Exposes the local repo tools to ChatGPT, Claude, and Grok as schema-validated, sandboxed handlers. |
| **Tunnel** | Cloudflare Tunnel (`cloudflared`) | Gives the local MCP server a temporary public HTTPS URL that provider connectors can reach — no deployment required. |

**Why a tunnel at all?** Provider MCP connectors call tools over HTTPS, but the tool server runs on your machine. Rather than deploy anything, the bridge spins up an ephemeral Cloudflare Tunnel (`*.trycloudflare.com`) in front of the local port and syncs that Streamable HTTP `…/mcp` URL into the provider app on startup. (ngrok would solve the same reachability problem; Cloudflare's `cloudflared` is used because its quick tunnels need no account or auth token. Grok's UI may show an `/sse` example — the bridge registers `/mcp` because cloudflared quick tunnels do not support SSE.)

## Quick start

**Prerequisites**

- **macOS or Windows** — macOS launches Google Chrome; Windows launches Microsoft Edge. Both connect through the same Chromium CDP boundary.
- **Node.js ≥ 22** and **pnpm** (the repo pins `pnpm@10.14.0`).
- **Google Chrome on macOS or Microsoft Edge on Windows** — the bridge drives one shared bridge profile through a debug port. Sign in once in that bridge-launched window; every repo reuses it.
- **`cloudflared`** *(optional; ChatGPT, Claude, Grok)* — only needed for those providers to call local MCP tools. Without it the TUI still runs. Install with `brew install cloudflared`.

**Install & build**

```bash
git clone https://github.com/YosefHayim/ai-browser-bridge.git
cd ai-browser-bridge
pnpm install
pnpm build
```

**Start the bridge browser, then run (ChatGPT — default)**

```bash
node dist/bridge.js chrome start
node dist/bridge.js --repo /path/to/your/project
```

On Windows, double-click `start-bridge.cmd` in the repository root. It changes to its own
directory, installs missing dependencies, rebuilds the current source, and opens the persistent
Agent workspace. Keep the shared bridge Edge window signed in.

**Start Chrome, then run (Gemini web)**

```bash
node dist/bridge.js chrome start --provider gemini
node dist/bridge.js --provider gemini --repo /path/to/your/project
```

Prefer a global `bridge` command? Run `pnpm link --global` after building, then use `bridge`, `bridge chrome start`, `bridge ask "…"`, etc.

Running `bridge` with no subcommand opens a terminal launch panel. Use it to select Agent or
Conversation mode, the Target repo, Provider, permission mode, and whether to start a fresh
Conversation. The selection is saved to the Target repo's `.bridge/config.json`, so interactive
runs do not require repeated `--repo` or `--permissions` flags. CLI options remain available for
scripts and automation. Start the shared bridge browser once with `bridge chrome start` and leave
it open; the panel reuses that running browser without creating a second CDP connection.

Agent mode is persistent: after each task it keeps the same web Conversation and settings, shows
the previous result, clears the Task field, and waits for the next task. Set `New Conversation` to
`yes` only when a task should start without prior context; press Escape to leave the workspace.
Repo and Task fields support cursor movement, insertion, Backspace, Delete, and Ctrl+A.

### Browser profile policy

Chrome 136+ no longer accepts remote debugging switches against the real default Chrome data directory. `ai-browser-bridge` therefore does **not** drive `~/Library/Application Support/Google/Chrome`. It always launches the browser on the debug port with one global bridge profile:

```text
~/.ai-browser-bridge/chrome-profile
```

That profile is the browser-login SSOT for the bridge. Sign in once in the bridge-launched Chrome window, then `bridge chrome start`, `bridge ask`, and the TUI reuse that login from any repo or shell root.

For release and automation work, Chrome's team recommends [Chrome for Testing](https://developer.chrome.com/blog/chrome-for-testing). Install it separately, then point the bridge at that app while keeping the same shared profile:

```bash
AI_BROWSER_BRIDGE_CHROME_APP="Google Chrome for Testing" bridge chrome start
```

The macOS app override changes only which Chrome build is launched. On Windows, set `AI_BROWSER_BRIDGE_EDGE_EXECUTABLE` to override Edge's executable path. The profile remains `~/.ai-browser-bridge/chrome-profile`; do not add per-repo browser profiles. See Chrome's [remote-debugging profile change](https://developer.chrome.com/blog/remote-debugging-port) for the upstream reason.

**One-shot, non-interactive**

```bash
node dist/bridge.js ask "summarize @src/core/engine.ts" --repo /path/to/project
node dist/bridge.js ask "hello" --provider gemini --repo /path/to/project
```

### Use a web AI as a local coding agent

First launch the bridge-managed browser and sign in once. On macOS this opens Chrome; on Windows
it opens Edge. Keep that browser window open.

```bash
node dist/bridge.js chrome start --provider chatgpt
```

Start with read-only access:

```bash
node dist/bridge.js agent "inspect package.json and summarize the scripts" \
  --provider chatgpt --repo /path/to/project
```

Allow validated patches and allowlisted test commands only when the task needs to change files:

```bash
node dist/bridge.js agent "fix the failing browser runtime test" \
  --provider chatgpt --repo /path/to/project --permissions auto
```

`bridge agent` keeps reasoning in the selected web Conversation. The Provider returns one JSON
tool request per turn; the Bridge validates it and reuses the existing `grep_code`, `read_file`,
`apply_patch`, `run_tests`, and `git_diff` handlers locally. It defaults to `read-only`; write and
test tools require `--permissions auto`. The loop never exposes a raw shell, rejects paths outside
the Target repo, and stops after 24 web turns unless `--max-turns` is set. One web turn may batch
up to eight independent read-only Tools; patch and test Tools remain single calls so their inputs
can be based on inspected results. Every Tool result also carries a compact original-task and
completed-call recap to prevent the model from losing its place.

Useful options:

| Option | Purpose |
|--------|---------|
| `--provider <name>` | Select `chatgpt`, `gemini`, `claude`, `deepseek`, `grok`, `perplexity`, `duck`, or `arena`. |
| `--repo <path>` | Set the only repository the Tools may access. |
| `--permissions read-only` | Permit inspection only; this is the default. |
| `--permissions auto` | Also permit validated patches and allowlisted tests. |
| `--fresh` | Start a new web Conversation for the task. |
| `--conversation <idOrUrl>` | Continue a specific existing Conversation. |
| `--max-turns <number>` | Change the default 24-turn limit. |
| `--json` | Print a machine-readable completion result. |

Provider web pages change over time. If a Provider cannot find its composer, confirm that the
bridge-managed profile is signed in first; if it is, its selectors may need updating. ChatGPT is
the currently verified read/write path, while the same protocol is available to the other chat
Providers through their adapters.

### Permission boundary

`auto` means automatic access inside the Target repo, not unrestricted computer access. Known
read, patch (including text-file creation and deletion), and allowlisted test Tools may run there.
Every file path is normalized and validated first; absolute paths, `..` escapes, and paths outside
the Target repo are rejected. The Bridge exposes no raw shell. Any future unclassified process
Tool requires explicit human review even in `auto` mode and fails with
`process-review-required` until such a review path is implemented.

## Usage

```text
/help             list commands              /sessions         list local sessions
/resume <query>   resume by number/title/id  /transcript       print the session transcript
/new              start a new conversation   /export           export transcript (md/json/jsonl)
/model [name]     show or switch the model    /permissions      show or switch MCP permission mode
/rewind [text]    edit last prompt + regen   /checkpoints      list file checkpoints
/stop             stop the active response   /restore <id>     restore files from a checkpoint
/context          model-aware context est.   /status           repo/model/context/session status
/diff             ask ChatGPT to read diff   /mcp              connector + exposed tools
/task <request>   project-agent task (MCP)   /connector        (re)run MCP connector setup
/conversations    list/search/open browser conversations
```

**File mentions** — reference repo files inline; they are resolved inside the repo and expanded before ChatGPT sees them:

```text
refactor the CLI input flow in @src/features/terminal/tui/App.tsx
compare @src/features/store/fileMentions.ts with @src/features/store/fileMentions.test.ts
```

Paths that escape the repo root are skipped; files over 100 KB are summarized rather than inlined.

**Conversation search** — `bridge chat search "query" --json` opens ChatGPT's Search UI,
selects Chats, and returns matching Conversations across titles and message content. It scrolls
the result overlay up to `--limit`; add `--open` to navigate the browser to the best match.

**Rate-safe Project organization** — prepare one ordered plan with Conversations for any number
of Projects (Conversation ids are preferred because they can be verified exactly):

```json
[
  { "conversation": "11111111-1111-4111-8111-111111111111", "project": "Yoga App" },
  { "conversation": "22222222-2222-4222-8222-222222222222", "project": "Invoices & Purchases" }
]
```

Then validate it and start the autonomous queue:

```bash
bridge chat organize --plan @organization-plan.json --dry-run
bridge chat organize --plan @organization-plan.json \
  --interval 60 --cooldown 600 --max-attempts 4

# No plan argument is needed after the queue exists
bridge chat organize status
bridge chat organize pause
bridge chat organize resume
```

The queue verifies every move from ChatGPT's loaded Project label, with the destination Project page
as a fallback. Adaptive pacing starts from `--interval 60` with jitter. After three successful moves
it reduces the base interval by 20%, down to `--min-interval 15`; a ChatGPT “Too many requests”
response increases the base interval by 50%, up to `--max-interval 180`, and waits for the
`--cooldown 600`. The learned pace is persisted across pause/resume. Pass `--no-adaptive` for the
old fixed/random interval behavior.

`bridge chat organize pause` writes a persisted pause request; an active queue finishes only its
current UI operation, notices the request within one second of a delay, and releases its lock.
`bridge chat organize resume` selects the latest queue, clears the pause marker, and reconstructs the
original plan from persisted state. Use `--queue <fingerprintOrPath>` when more than one queue exists.

Rate limits and closed browser sessions do not consume move attempts. When pending work reaches
zero, the queue automatically runs the orphan scanner to the stable end of ChatGPT history (eight
unchanged bottom passes; it errors rather than returning a partial inventory). The final audit
reports remaining intentional/unplanned orphans and any planned Conversation that is still loose;
still-loose planned Conversations are automatically retried up to `--max-attempts`.
Progress is persisted under `.bridge/chat-organization-queues/`, so an agent does not need to keep
watching. Use `--restart` only to intentionally replay the full plan, and `--no-verify` only when the
completion audit is intentionally unnecessary. `--json` keeps summaries on stdout and progress on
stderr.

## Agents & fan-out

`bridge ask` is a stable, non-interactive surface for scripts and agents — it prints to stdout, never prompts in a pipe, and `--json` emits a machine-readable payload.

```bash
# one provider
bridge ask --provider claude --json "summarize the tradeoffs of optimistic locking"

# fan out across several free chats; one call, replies keyed by provider
bridge ask --provider claude,deepseek,grok --json "same question, three models"
# → { "claude": { "ok": true, "reply": "…", "elapsedMs": 8123 },
#     "deepseek": { "ok": true, "reply": "…", "elapsedMs": 6210 },
#     "grok": { "ok": false, "error": "…", "elapsedMs": 300000 } }
```

Fan-out is **partial-failure tolerant**: the run exits non-zero only when *every* provider fails, or — with `--strict` — when *any* fails. Run `bridge chrome start --provider <name>` and sign in if needed; the bridge reuses the shared bridge Chrome profile across repos.

The same fan-out core is exposed through outbound MCP tools — launch a stdio MCP server with `bridge serve` and any MCP-capable agent can call `ask({ prompt, providers })` or `search_conversations({ query, providers, limit })` as native tools instead of shelling out. Register it with Claude Code:

```bash
claude mcp add ai-browser-bridge -- bridge serve
```

…or add it to any MCP client config directly (the standard stdio-server shape):

```jsonc
{
  "mcpServers": {
    "ai-browser-bridge": { "command": "bridge", "args": ["serve"] }
  }
}
```

The `ask` tool takes `{ prompt, providers?, timeoutSeconds? }` and returns each provider's reply keyed by id (the same partial-failure-tolerant fan-out as `bridge ask`). The `search_conversations` tool takes `{ query, providers?, limit? }` and returns matching conversation URLs keyed by provider. Run `bridge chrome start --provider <name>` first, so the gateway has a signed-in Chrome session to drive. This is the opposite direction to the inbound MCP server, which exposes your repo tools *to* the web model.

> Provider adapters other than ChatGPT/Gemini ship with best-effort selectors marked `LIVE-VERIFY` — confirm them against the live signed-in site before relying on them in production.

## Where state lives

Persistent bridge state is written under the canonical Git working-tree root's `<repo>/.bridge/`. The bridge resolves both `--repo` and the launch directory to that root, so nested launches cannot create competing state or download folders. An explicit non-Git directory remains its own root.

```text
<repo>/.bridge/
├── config.json       # per-repo settings (includes `provider`: chatgpt | gemini)
├── sessions/<id>/    # metadata.json + append-only events.jsonl transcript
├── logs/<date>.jsonl # prompts, replies, and MCP tool-call summaries
├── checkpoints/      # before/after snapshots around each apply_patch
├── exports/          # /export output
├── downloads/<conv>/ # attachment downloads (default when no --out given)
└── screenshots/      # /screenshot and /ui-qa captures
```

Plain `bridge ask` and `bridge chrome start` do not create repo-local state; they only reuse the shared Chrome profile. The bridge creates `<repo>/.bridge/` for persistent TUI sessions, tool-enabled asks (`bridge ask --tools`), checkpoints, exports, screenshots, or default attachment downloads.

The bridge does not create or manage `.bridge/.gitignore`; ignore policy belongs to the target repository. Chrome cookies for bridge-driven sessions stay in the shared bridge profile under `~/.ai-browser-bridge/chrome-profile`, not under `.bridge/`.

> User-authored config meant to apply across **all** repos lives in your home directory: custom commands in `~/.ai-browser-bridge/commands/*.md` and user-level hooks in `~/.ai-browser-bridge/hooks.json`.

### Migrating from `chatgpt-local-bridge`

The package was renamed to **`ai-browser-bridge`**. Global user config moved from `~/.chatgpt-local-bridge/` to `~/.ai-browser-bridge/` — copy your `commands/` folder and `hooks.json` if you had them. Persistent repo-local state stays at `<repo>/.bridge/` (unchanged). Re-run `/connector` or `bridge ask --tools` once so ChatGPT picks up the renamed MCP connector app.

## Permissions & checkpoints

```bash
/permissions read-only   # grep_code, read_file, git_diff
/permissions auto        # also the narrow write/test tools
/permissions ask         # blocks write/test/process tools (interactive confirm pending)
```

`apply_patch` snapshots every touched path before and after the change. Recover with `/checkpoints`, `/restore <id>`, or `/rewind --files <id>`.

## Testing

```bash
pnpm test          # vitest run
pnpm typecheck     # tsc --noEmit
pnpm verify:push   # Biome + style mirror + typecheck + test + build + boundary/compatibility checks
```

Coverage focuses on the safety-sensitive paths — sandbox validation, canonical repo-root resolution, session/checkpoint stores, permissions, and context counting.

## Gemini web support

The bridge can drive **gemini.google.com** from the terminal with the same Playwright/CDP pattern as ChatGPT:

```bash
bridge chrome start --provider gemini
bridge --provider gemini --repo /path/to/project
bridge ask "explain this repo" --provider gemini --repo /path/to/project
```

**What works on Gemini web**

- Terminal-driven prompts and captured replies
- `@file` mention expansion (read-only repo context inlined into prompts)
- Model detection/switching when the Gemini UI exposes a picker
- Reuses the same shared bridge profile/debug port model as every provider

**What does not work on Gemini web (today)**

- **MCP connector** — gemini.google.com has no custom connector UI like ChatGPT, Claude, or Grok. The bridge skips the MCP server and Cloudflare tunnel when `--provider gemini`.
- **`/task`, `/connector`, `/mcp`** — these require live MCP tools; use ChatGPT, Claude, or Grok for those workflows.
- **Attachment download** — `bridge download` is ChatGPT-only for now.

For full MCP on Gemini, use the official [Gemini API Remote MCP](https://ai.google.dev/gemini-api/docs/function-calling) or [Gemini CLI](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md) instead of the browser UI.

**Selector maintenance:** when Google changes the Gemini web UI, fix selectors only in [`src/features/providers/gemini/geminiPage.ts`](src/features/providers/gemini/geminiPage.ts).

## Arena.ai support

The bridge drives **[Arena](https://arena.ai/code/direct)** (LMSYS) with a dedicated adapter for the mode menu and model picker:

| Mode | `--model` token | URL |
|------|-----------------|-----|
| **Direct** (default) | `direct` | `/code/direct` — one model |
| **Battle Mode** | `battle` | `/code` — Option A/B (dual reply when both finish) |
| **Agent Mode** | `agent` | `/agent` — agent shell (best-effort) |
| **Side by Side** | `side` / `sbs` | `/text/side-by-side` — pick two models |

```bash
bridge chrome start --provider arena
bridge ask --provider arena "build a todo app"                          # Direct + Max
bridge ask --provider arena --model glm-5.1 "reply with pong"           # pick a model
bridge ask --provider arena --model battle "compare two approaches"     # dual Option A/B
bridge ask --provider arena --model direct/gemini-3-flash "hello"       # mode + model
```

Model search matches the in-UI picker (Search models + Text/Code/Image/Search tabs). Battle turns on Code Arena can take minutes (full site builds) — raise `--timeout` if needed. No MCP connector on Arena.

## Google Flow support

The bridge can also drive **[Google Labs Flow](https://labs.google/fx/tools/flow)** — Google's Veo-powered AI video studio — with the same Playwright/CDP pattern. Flow is different in kind from the chat providers: it is a **generation** surface, so a "reply" is a rendered **clip** and attachments are **ingredients** (reference images).

```bash
bridge chrome start --provider flow    # sign in to Google; account needs Flow access (AI Pro/Ultra)
bridge ask --provider flow "a cat surfing a neon wave, cinematic, 8s"
bridge ask --provider flow "same scene, dawn light" --attach ref1.png ref2.png   # up to 3 ingredients
```

Beyond generating, the bridge drives Flow's full **asset lifecycle** through `bridge flow` subcommands (each attaches to your current Flow project tab; add `--json` for machine-readable output):

```bash
bridge flow clips                        # list clips in the current project (id + fetchable URL)
bridge flow download                     # download every clip's mp4 to <repo>/.bridge/downloads/flow
bridge flow reuse   --id <clipId>        # add a clip back to the prompt as input ("Add to prompt")
bridge flow extend  --id <clipId>        # add a clip to a scene (Flow's "Add to scene")
bridge flow rename  --id <clipId> --name "hero shot"
bridge flow delete  --id <clipId> --yes  # move a clip to Flow Trash (recoverable)
bridge flow ingredients                  # list reference images attached to the prompt
bridge flow ingredient-remove --id <mediaId>   # detach one ingredient
bridge flow ingredient-clear             # detach every ingredient
bridge flow projects                     # list projects
bridge flow project-rename --name "Launch teaser"
bridge flow project-delete --yes         # permanently delete the current project
```

Destructive verbs (`delete`, `project-delete`) require `--yes`; clip delete moves to Flow's recoverable Trash.

Agents without shell access get the same lifecycle as **`flow_*` MCP tools** over `bridge serve` — `flow_list_clips`, `flow_download_clips`, `flow_reuse_clip`, `flow_extend_clip`, `flow_rename_clip`, `flow_delete_clip`, `flow_list_ingredients`, `flow_remove_ingredient`, `flow_clear_ingredients`, `flow_list_projects`, `flow_rename_project`, `flow_delete_project`. Destructive tools (`flow_delete_clip`, `flow_delete_project`) require `confirm: true`.

**What works on Flow**

- Terminal-driven shot prompts that trigger Veo generation
- **Ingredients** — attach up to three reference images to a prompt, and list / remove / clear already-attached ones
- A captured **clip reference** (video `src` / download href) returned as the reply, so an agent gets a pointer to the result
- **Asset CRUD** — list / download / rename / delete clips, extend or reuse a clip, manage prompt ingredients, and list / rename / delete projects — as `bridge flow …` CLI commands **and** `flow_*` MCP tools over `bridge serve`
- Reuses the same shared bridge profile / debug-port model as every provider

**What does not work on Flow (today)**

- **MCP connector**, **`/task`**, **`/connector`**, **`/mcp`** — Flow has no connector UI, so the MCP server and Cloudflare tunnel are skipped (same as Gemini).
- **Stop / mid-render controls** — cancelling a Veo render in flight is not wired yet.

Flow requires a **Google AI Pro/Ultra** plan. Because Veo renders take minutes, `--provider flow` waits far longer for a response than the chat providers do.

**Selector maintenance:** Flow's selectors were **LIVE-VERIFIED** against a signed-in project editor. If Google changes the UI, recapture with `node scripts/dev/captureProviderSelectors.mjs`, then update [`src/config.ts`](src/config.ts); generation lives in [`src/features/providers/flow/flowPage.ts`](src/features/providers/flow/flowPage.ts) and asset CRUD in [`src/features/providers/flow/flowAssets.ts`](src/features/providers/flow/flowAssets.ts).

## Limitations

- **macOS and Windows** are supported through Chrome and Edge respectively.
- ChatGPT and Gemini browser selectors can break when the web UI changes; fixes are localized to the browser layer.
- Context usage is an **estimate** — the browser does not expose exact server-side token counts.
- The Cloudflare Tunnel requires `cloudflared` installed.
- Local-first by design; not a hosted multi-user service.
- Hook command execution is parsed and reported but not yet executed (an allowlisted confirmation flow is pending).

## License

[MIT](LICENSE) © YosefHayim

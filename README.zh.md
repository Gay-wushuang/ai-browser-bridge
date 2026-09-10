<p align="center">
  <img src="assets/hero.png" alt="ai-browser-bridge — 通过 Chrome 从终端驱动 ChatGPT、Gemini、Claude、DeepSeek、Grok、Perplexity 与 Flow" width="640" />
</p>

# ai-browser-bridge

[English](README.md) · [עברית](README.he.md) · [Español](README.es.md) · **中文**

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-browser-2EAD33?logo=playwright&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-connector-000000)

---

> 把已登录的 ChatGPT 和其他网页版 AI 变成可读写本地仓库的安全编程智能体：复用 Chrome 或 Edge，无需模型 API，也不开放原始 Shell。

## 为什么需要它

ChatGPT 在浏览器中表现最佳——真实的账户状态、模型选择器、消息编辑、重新生成以及会话历史都完整保留。而写代码在终端中最高效，可以直接检查和修改文件、测试、diff 与补丁。

`ai-browser-bridge` 把这两个界面连接起来。它复用已经登录的 Chrome 或 Edge 配置文件，
驱动提供商真实的网页界面，并只向网页 AI 提供五个经过校验的仓库工具：`grep_code`、
`read_file`、`apply_patch`、`run_tests` 和 `git_diff`。因此你可以继续使用网页订阅中的模型、
登录状态和会话历史，同时把本地访问严格限制在指定仓库内。

本地工具有两种接入方式。`bridge agent` 使用结构化文本循环，不需要网页端支持 MCP，
也不需要 Cloudflare 隧道、模型 API 或本地模型；交互界面的 `/task` 则在提供商支持时使用
MCP 连接器与隧道。两种方式都不会把原始 Shell 交给网页 AI。

## 功能

- **九个提供商，一个命令** — ChatGPT、Gemini、Claude、DeepSeek、Grok、Perplexity、Duck.ai、Arena 与 Google Flow。使用 `--provider` 选择一个，或并行询问多个。
- **把网页订阅变成本地智能体** — `bridge agent` 可以让已登录的网页 AI 检查和修改指定仓库，无需另外购买模型 API。
- **面向智能体** — `bridge ask … --json` 提供稳定的非交互接口，`bridge serve` 则暴露出站 MCP 工具。
- **通过 MCP 的沙箱化本地工具** — 每个文件操作都针对所选仓库根目录进行校验；没有任意 shell，仅允许白名单内的测试命令。
- **浏览器操作即命令** — `/resume`、`/new`、`/model`、`/rewind`、`/stop`、`/context`、`/diff`、`/compact` 等。
- **仓库根目录中的会话、记录与下载** — 持久化运行始终使用 `<repo>/.bridge/`，即使从子目录启动也是如此。
- **安全控制** — 权限模式（`read-only` / `ask` / `auto`）以及每次补丁前后的自动文件检查点。
- **项目约定** — 自定义命令以及 `AGENTS.md` / `CLAUDE.md` 会在 `/task` 运行时提供给 ChatGPT。
- **真正的输入器** — 提示词历史、反向搜索、提示词排队，以及 `@file` 提及的自动补全。

## 架构

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

四个层，各司其职：

| 层 | 技术 | 职责 |
|----|------|------|
| **CLI** | Ink / React | 终端界面：消息面板、状态栏、`@file` 提及、`/` 命令。 |
| **浏览器** | Playwright + Chrome DevTools Protocol | 通过调试端口连接 Chrome，并复用唯一的共享 bridge 配置文件。提供商适配器位于 `src/features/providers/`。 |
| **MCP 服务器** | MCP SDK + Effect Schema | 向 ChatGPT、Claude 与 Grok 暴露经过校验且沙箱化的本地工具。 |
| **隧道** | Cloudflare Tunnel (`cloudflared`) | 为本地 MCP 服务器提供一个临时的公共 HTTPS 地址，供 ChatGPT 连接器访问——无需部署。 |

**为什么需要隧道？** ChatGPT 的 MCP 连接器通过 HTTPS 调用工具，但工具服务器运行在你的机器上。与其部署任何东西，bridge 在本地端口前面启动一个临时的 Cloudflare 隧道（`*.trycloudflare.com`），并在启动时把该 `…/mcp` 地址同步到 ChatGPT 应用中。（ngrok 也能解决同样的可达性问题；这里使用 Cloudflare 的 `cloudflared`，因为它的快速隧道无需账户或令牌。）

## 快速开始

**前置条件**

- **macOS 或 Windows** — macOS 使用 Google Chrome，Windows 使用 Microsoft Edge；二者都通过 Chromium CDP 连接。
- **Node.js ≥ 22** 与 **pnpm**（仓库锁定 `pnpm@10.14.0`）。
- **Google Chrome 或 Chrome for Testing** — bridge 复用 `~/.ai-browser-bridge/chrome-profile` 中的全局共享配置文件。
- **`cloudflared`** *（可选）* — ChatGPT、Claude 或 Grok 调用本地工具时需要。没有它 TUI 仍可运行。安装：`brew install cloudflared`。

**安装与构建**

```bash
git clone https://github.com/YosefHayim/ai-browser-bridge.git
cd ai-browser-bridge
pnpm install
pnpm build
```

**启动 bridge 浏览器，然后运行**

```bash
# macOS 打开 Chrome，Windows 打开 Edge；首次使用请在这个窗口中登录
node dist/bridge.js chrome start

# 针对你希望 ChatGPT 操作的仓库启动终端界面
node dist/bridge.js --repo /path/to/your/project
```

想要一个全局 `bridge` 命令？构建后运行 `pnpm link --global`，然后使用 `bridge`、`bridge chrome start`、`bridge ask "…"` 等。

直接运行 `bridge` 会先打开终端启动面板。可以用方向键选择网页 AI 编程任务或普通会话、
Provider、权限和是否新建会话，并直接填写仓库路径与任务。确认后这些设置会保存到目标仓库的
`.bridge/config.json`，以后不必反复输入 `--repo` 和 `--permissions`。命令行参数仍保留给脚本和
自动化使用。首次使用先运行一次 `bridge chrome start`，并保持这个共享浏览器开启；启动面板
只会复用它，不会再建立一次临时连接。

## 让网页 AI 读写本地仓库

先启动 bridge 管理的浏览器并登录。浏览器窗口需要保持打开：

```powershell
node dist/bridge.js chrome start --provider chatgpt
```

建议先用默认的只读模式确认目标仓库：

```powershell
node dist/bridge.js agent "读取 package.json，并说明项目使用了哪些脚本" `
  --provider chatgpt --repo E:\path\to\project
```

任务确实需要改文件时，再显式开启写入和白名单测试权限：

```powershell
node dist/bridge.js agent "修复失败的测试，检查 diff 后说明改动" `
  --provider chatgpt --repo E:\path\to\project --permissions auto
```

`bridge agent` 会让网页 AI 每轮返回一个结构化工具请求，Bridge 校验后在本地执行，再把
结果送回同一个网页会话。终端会显示当前轮次、等待网页回复和正在执行的工具；单轮默认
等待 90 秒，按 `Ctrl+C` 可以随时终止。它不会要求网页端安装 MCP 连接器，也不会安装另一个模型。

| 参数 | 用途 |
|------|------|
| `--provider <名称>` | 选择 `chatgpt`、`gemini`、`claude`、`deepseek`、`grok`、`perplexity`、`duck` 或 `arena`。 |
| `--repo <路径>` | 指定工具唯一可以访问的仓库。 |
| `--permissions read-only` | 只允许搜索、读取和查看 diff；这是默认值。 |
| `--permissions auto` | 额外允许经过校验的补丁和白名单测试。 |
| `--fresh` | 为本次任务新建网页会话。 |
| `--conversation <ID或URL>` | 连接并继续某个已有网页会话。 |
| `--max-turns <数量>` | 修改默认的 12 轮上限。 |
| `--json` | 输出便于程序读取的完成结果。 |

如果提示找不到输入框，先确认登录的是 bridge 打开的共享配置文件，而不是日常浏览器的
另一个配置文件。登录正常时仍失败，通常意味着该提供商更新了网页结构，需要调整对应
适配器的选择器。目前 ChatGPT 的真实读写闭环已经验证通过；其他聊天提供商复用同一协议，
但各自网页适配器仍需分别验证。

## 智能体与提供商

`bridge ask` 可以询问单个提供商，也可以把同一问题并行发送给多个提供商。结果按提供商返回，部分失败不会丢弃成功结果。

```bash
bridge ask --provider claude --json "summarize this repo"
bridge ask --provider claude,deepseek,grok --json "compare these approaches"
bridge serve
```

`bridge serve` 通过 MCP stdio 提供 `ask` 与 `search_conversations`。ChatGPT、Claude 与 Grok 可使用入站 MCP 连接器；Gemini、DeepSeek、Perplexity、Duck.ai 与 Arena 作为网页聊天运行，Flow 则作为视频生成界面运行。

## 状态保存在哪里

某个项目的所有 bridge 状态都写入 Git 工作树规范根目录下的 `<repo>/.bridge/`。即使从子目录启动，也只会使用这一处根目录；显式指定的非 Git 目录仍以自身作为根目录。bridge 不会创建或管理 `.bridge/.gitignore`；忽略策略由目标仓库自行决定。

> 由用户编写、意在应用于**所有**仓库的配置位于你的主目录中：自定义命令在 `~/.ai-browser-bridge/commands/*.md`，用户级 hooks 在 `~/.ai-browser-bridge/hooks.json`。

## 权限与检查点

```bash
/permissions read-only   # grep_code, read_file, git_diff
/permissions auto        # 以及受限的写入/测试工具
/permissions ask         # 阻止写入/测试/进程工具（交互式确认待实现）
```

`apply_patch` 会在变更前后对每个涉及的路径进行快照。使用 `/checkpoints`、`/restore <id>` 或 `/rewind --files <id>` 恢复。

## 测试

```bash
pnpm test          # vitest run
pnpm typecheck     # tsc --noEmit
pnpm verify:push   # Biome + typecheck + tests + build + 结构检查
```

覆盖率聚焦于安全敏感路径——沙箱校验、规范仓库根目录解析、会话/检查点存储、权限以及上下文计数。

## Google Flow 支持

bridge 也可以驱动 **[Google Labs Flow](https://labs.google/fx/tools/flow)**——Google 基于 Veo 的 AI 视频工作室——采用与聊天类提供商相同的 Playwright/CDP 模式。Flow 与聊天类提供商本质不同：它是一个**生成**界面，因此“回复”是一段渲染出的**片段（clip）**，而附件则是**素材（ingredients）**（参考图像）。

```bash
bridge chrome start --provider flow    # 登录 Google；账户需要 Flow 访问权限（AI Pro/Ultra）
bridge ask --provider flow "a cat surfing a neon wave, cinematic, 8s"
bridge ask --provider flow "same scene, dawn light" --attach ref1.png ref2.png   # 最多 3 个素材
```

除了生成之外，bridge 还通过 `bridge flow` 子命令驱动 Flow 完整的**素材生命周期**（每个子命令都会附着到你当前的 Flow 项目标签页；添加 `--json` 可获得机器可读的输出）：

```bash
bridge flow clips                        # 列出当前项目中的片段（id + 可获取的 URL）
bridge flow download                     # 将片段下载到 <repo>/.bridge/downloads/flow
bridge flow reuse   --id <clipId>        # 将片段作为输入重新加入提示词（"Add to prompt"）
bridge flow extend  --id <clipId>        # 将片段加入场景（Flow 的 "Add to scene"）
bridge flow rename  --id <clipId> --name "hero shot"
bridge flow delete  --id <clipId> --yes  # 将片段移入 Flow 回收站（可恢复）
bridge flow ingredients                  # 列出附加到提示词的参考图像
bridge flow ingredient-remove --id <mediaId>   # 移除单个素材
bridge flow ingredient-clear             # 移除全部素材
bridge flow projects                     # 列出项目
bridge flow project-rename --name "Launch teaser"
bridge flow project-delete --yes         # 永久删除当前项目
```

破坏性动词（`delete`、`project-delete`）需要 `--yes`；删除片段会将其移入 Flow 可恢复的回收站。

没有 shell 访问权限的智能体可以通过 `bridge serve` 以 **`flow_*` MCP 工具**的形式获得相同的生命周期——`flow_list_clips`、`flow_download_clips`、`flow_reuse_clip`、`flow_extend_clip`、`flow_rename_clip`、`flow_delete_clip`、`flow_list_ingredients`、`flow_remove_ingredient`、`flow_clear_ingredients`、`flow_list_projects`、`flow_rename_project`、`flow_delete_project`。破坏性工具（`flow_delete_clip`、`flow_delete_project`）需要 `confirm: true`。

**Flow 上可用的功能**

- 从终端驱动、触发 Veo 生成的镜头提示词
- **素材（ingredients）** — 为提示词附加最多三张参考图像，并列出 / 移除 / 清空已附加的素材
- 捕获到的**片段引用**（视频的 `src` / 下载 href）作为回复返回，因此智能体能获得指向结果的指针
- **素材 CRUD** — 列出 / 下载 / 重命名 / 删除片段，扩展或复用片段，管理提示词素材，以及列出 / 重命名 / 删除项目 — 既可作为 `bridge flow …` CLI 命令，**也可**作为通过 `bridge serve` 提供的 `flow_*` MCP 工具
- 复用与所有提供商相同的共享 bridge 配置文件 / 调试端口模型

**Flow 上尚不可用的功能（当前）**

- **MCP 连接器**、**`/task`**、**`/connector`**、**`/mcp`** — Flow 没有连接器界面，因此会跳过 MCP 服务器和 Cloudflare 隧道（与 Gemini 相同）。
- **停止 / 渲染中途控制** — 尚未接入对进行中的 Veo 渲染的取消功能。

Flow 需要 **Google AI Pro/Ultra** 套餐。由于 Veo 渲染需要数分钟，`--provider flow` 等待响应的时间远比聊天类提供商更长。

**选择器维护：** Flow 的选择器已针对已登录的项目编辑器**实时验证（LIVE-VERIFIED）**。如果 Google 更改了 UI，请使用 `node scripts/dev/captureProviderSelectors.mjs` 重新捕获，然后更新 [`src/config.ts`](src/config.ts)；生成逻辑位于 [`src/features/providers/flow/flowPage.ts`](src/features/providers/flow/flowPage.ts)，素材 CRUD 位于 [`src/features/providers/flow/flowAssets.ts`](src/features/providers/flow/flowAssets.ts)。

## 限制

- 目前**仅支持 macOS**（硬编码的 Chrome 路径以及 `pbcopy`/`lsof` 辅助）。
- 当提供商的网页界面变动时，选择器可能失效；修复集中在对应适配器中。
- 上下文用量是**估算值**——浏览器不暴露服务器端的精确 token 计数。
- Cloudflare 隧道需要已安装 `cloudflared`。
- 设计上以本地优先；并非托管的多用户服务。
- Hook 命令执行会被解析和报告，但尚未实际执行。

## 许可证

[MIT](LICENSE) © YosefHayim

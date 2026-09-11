import type { PermissionMode, ToolResult } from "@/features/domain";
import { executeRepositoryTool } from "@/features/tools";
import type { BridgeEngine } from "./bridgeEngine.ts";

const WEB_TOOL_NAMES = [
  "list_files",
  "grep_code",
  "read_file",
  "apply_patch",
  "run_tests",
  "git_diff",
] as const;
type WebToolName = (typeof WEB_TOOL_NAMES)[number];

type WebToolCall = {
  readonly type: "tool_call";
  readonly name: WebToolName;
  readonly arguments: Record<string, unknown>;
};

type WebToolBatch = {
  readonly type: "tool_calls";
  readonly calls: readonly WebToolCall[];
};

type WebToolCompletion = {
  readonly type: "complete";
  readonly summary: string;
};

export type WebToolAgentResult = {
  readonly completed: boolean;
  readonly summary: string;
  readonly turns: number;
  readonly toolCalls: number;
};

export type WebToolAgentProgress = (message: string) => void;

const JSON_FENCE = /```(?:json)?\s*(?<json>\{[\s\S]*?\})\s*```/iu;
const MAX_BATCH_TOOL_CALLS = 8;
const BATCH_TOOL_NAMES = new Set<WebToolName>(["list_files", "grep_code", "read_file", "git_diff"]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isWebToolName = (value: string): value is WebToolName => {
  return WEB_TOOL_NAMES.some((toolName) => toolName === value);
};

const protocolJson = (reply: string): string => {
  const fencedJson = JSON_FENCE.exec(reply)?.groups?.json;
  if (fencedJson !== undefined) return fencedJson;
  return reply.trim();
};

const parseWebToolCall = (value: unknown): WebToolCall => {
  if (!isRecord(value)) throw new Error("Each tool call must be one JSON object.");
  if (
    value.type === "tool_call" &&
    typeof value.name === "string" &&
    isWebToolName(value.name) &&
    isRecord(value.arguments)
  ) {
    return { type: "tool_call", name: value.name, arguments: value.arguments };
  }
  throw new Error("Invalid tool call object.");
};

const parseWebToolBatch = (parsed: Record<string, unknown>): WebToolBatch => {
  if (!Array.isArray(parsed.calls)) throw new Error("tool_calls requires a calls array.");
  if (parsed.calls.length < 1 || parsed.calls.length > MAX_BATCH_TOOL_CALLS) {
    throw new Error(`tool_calls must contain 1-${MAX_BATCH_TOOL_CALLS} calls.`);
  }
  const calls = parsed.calls.map((value) => parseWebToolCall(value));
  const unsafeBatchCall = calls.find((call) => !BATCH_TOOL_NAMES.has(call.name));
  if (unsafeBatchCall !== undefined) {
    throw new Error(`${unsafeBatchCall.name} must be requested alone after inspecting results.`);
  }
  return { type: "tool_calls", calls };
};

export const parseWebToolReply = (
  reply: string,
): WebToolCall | WebToolBatch | WebToolCompletion => {
  const parsed: unknown = JSON.parse(protocolJson(reply));
  if (!isRecord(parsed)) throw new Error("Web AI reply must be one JSON object.");
  if (parsed.type === "complete" && typeof parsed.summary === "string") {
    return { type: "complete", summary: parsed.summary };
  }
  if (parsed.type === "tool_call") return parseWebToolCall(parsed);
  if (parsed.type === "tool_calls") return parseWebToolBatch(parsed);
  throw new Error(
    "Reply must be one tool_call, a read-only tool_calls batch, or a complete object.",
  );
};

const agentProtocolPrompt = (task: string, permissionMode: PermissionMode): string => {
  return [
    "Act as a coding agent for a local repository. You can request sandboxed repository tools.",
    "This JSON conversation protocol is your tool access. Do not look for tools in the website UI.",
    "Your first response must be a list_files, grep_code, or read_file tool_call, or a read-only tool_calls batch; never complete.",
    "Return exactly one JSON object and no prose or Markdown fences.",
    "Tool call shape:",
    '{"type":"tool_call","name":"read_file","arguments":{"path":"README.md"}}',
    "Batch shape (1-8 read-only calls):",
    '{"type":"tool_calls","calls":[{"type":"tool_call","name":"read_file","arguments":{"path":"README.md"}},{"type":"tool_call","name":"read_file","arguments":{"path":"package.json"}}]}',
    "Completion shape:",
    '{"type":"complete","summary":"What changed and verification performed."}',
    "Available tools:",
    '- list_files: {"path"?:string,"depth"?:number,"max_entries"?:number}',
    '- grep_code: {"pattern":string,"path":string,"glob"?:string}',
    '- read_file: {"path":string,"start_line"?:number,"max_lines"?:number}',
    '- apply_patch: {"patch_lines":string[]} (preferred) or {"patch":string}; use a unified diff accepted by git apply, never *** Begin Patch syntax',
    'New-file patch_lines example: ["diff --git a/hello.txt b/hello.txt","new file mode 100644","--- /dev/null","+++ b/hello.txt","@@ -0,0 +1 @@","+hello"]',
    '- run_tests: {"command":string}',
    "- git_diff: {}",
    `Permission mode: ${permissionMode}.`,
    "If file locations are unknown, call list_files before grep_code. Inspect before editing.",
    "Batch independent list_files, grep_code, read_file, and git_diff calls when possible.",
    "apply_patch and run_tests must each be requested alone after relevant inspection results.",
    "Use patch_lines for multiline patches. JSON-escape quotes and backslashes inside every array item.",
    "Keep patches minimal. Run focused tests and git_diff before completion.",
    "Never request shell commands, absolute paths, files outside the repository, or Git commits.",
    "If a tool fails, inspect its result and recover with another valid tool call.",
    "Task:",
    task,
  ].join("\n");
};

type CompletedToolCall = {
  readonly name: WebToolName;
  readonly ok: boolean;
};

type WebToolResult = CompletedToolCall & {
  readonly output: string;
  readonly error?: string;
};

const toolResultPrompt = (input: {
  readonly task: string;
  readonly turn: number;
  readonly maxTurns: number;
  readonly results: readonly WebToolResult[];
  readonly completedCalls: readonly CompletedToolCall[];
}): string => {
  return [
    "TASK_STATE",
    JSON.stringify({
      originalTask: input.task,
      completedCalls: input.completedCalls,
      turn: input.turn,
      turnsRemaining: input.maxTurns - input.turn,
    }),
    "TOOL_RESULTS",
    JSON.stringify(input.results),
    "Continue the original task with exactly one JSON protocol object.",
    "Batch independent read-only calls when useful. Do not repeat successful calls unnecessarily.",
  ].join("\n");
};

const callsFromReply = (reply: WebToolCall | WebToolBatch): readonly WebToolCall[] => {
  if (reply.type === "tool_calls") return reply.calls;
  return [reply];
};

export const runWebToolAgent = async (input: {
  readonly engine: BridgeEngine;
  readonly task: string;
  readonly permissionMode: PermissionMode;
  readonly maxTurns: number;
  readonly timeoutMs?: number;
  readonly onProgress?: WebToolAgentProgress;
}): Promise<WebToolAgentResult> => {
  input.engine.permissionMode = input.permissionMode;
  let nextPrompt = agentProtocolPrompt(input.task, input.permissionMode);
  let toolCalls = 0;
  const calledTools = new Set<WebToolName>();
  const completedCalls: CompletedToolCall[] = [];
  for (let turn = 1; turn <= input.maxTurns; turn += 1) {
    input.onProgress?.(`Turn ${turn}/${input.maxTurns}: waiting for the web AI...`);
    const message = await input.engine.ask({ content: nextPrompt, timeoutMs: input.timeoutMs });
    if (message === null) throw new Error(`Web AI returned no reply on agent turn ${turn}.`);
    input.onProgress?.(`Turn ${turn}/${input.maxTurns}: reply received.`);
    let protocolReply: WebToolCall | WebToolBatch | WebToolCompletion;
    try {
      protocolReply = parseWebToolReply(message.content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      nextPrompt = [
        "PROTOCOL_ERROR",
        `Your previous response was not valid protocol JSON: ${errorMessage}`,
        `Original task: ${input.task}`,
        "Resend exactly one valid JSON object. Escape every quote and newline inside string values.",
      ].join("\n");
      continue;
    }
    if (protocolReply.type === "complete") {
      if (toolCalls === 0) {
        nextPrompt = [
          "PROTOCOL_ERROR",
          "You cannot complete before using a repository tool.",
          "Respond now with one list_files, grep_code, or read_file tool_call JSON object.",
        ].join("\n");
        continue;
      }
      if (calledTools.has("apply_patch") && !calledTools.has("git_diff")) {
        nextPrompt = [
          "PROTOCOL_ERROR",
          "You used apply_patch but have not reviewed the repository diff.",
          'Respond now with {"type":"tool_call","name":"git_diff","arguments":{}}.',
        ].join("\n");
        continue;
      }
      return { completed: true, summary: protocolReply.summary, turns: turn, toolCalls };
    }
    const calls = callsFromReply(protocolReply);
    input.onProgress?.(
      `Turn ${turn}/${input.maxTurns}: running ${calls.length} tool${calls.length === 1 ? "" : "s"}...`,
    );
    const results: WebToolResult[] = [];
    for (const call of calls) {
      input.onProgress?.(`  ${call.name}...`);
      const toolResult: ToolResult = await executeRepositoryTool({
        repoRoot: input.engine.config.repoPath,
        permissionMode: input.permissionMode,
        name: call.name,
        args: call.arguments,
      });
      const completedCall = { name: call.name, ok: toolResult.ok };
      completedCalls.push(completedCall);
      results.push({
        ...completedCall,
        output: toolResult.output,
        ...(toolResult.error === undefined ? {} : { error: toolResult.error }),
      });
      toolCalls += 1;
      calledTools.add(call.name);
      input.onProgress?.(`  ${call.name}: ${toolResult.ok ? "completed" : "failed"}`);
    }
    nextPrompt = toolResultPrompt({
      task: input.task,
      turn,
      maxTurns: input.maxTurns,
      results,
      completedCalls,
    });
  }
  return {
    completed: false,
    summary: `Stopped after ${input.maxTurns} turns before the web AI reported completion.`,
    turns: input.maxTurns,
    toolCalls,
  };
};

import type { PermissionMode, ToolResult } from "@/features/domain";
import { executeRepositoryTool } from "@/features/tools";
import type { BridgeEngine } from "./bridgeEngine.ts";

const WEB_TOOL_NAMES = ["grep_code", "read_file", "apply_patch", "run_tests", "git_diff"] as const;
type WebToolName = (typeof WEB_TOOL_NAMES)[number];

type WebToolCall = {
  readonly type: "tool_call";
  readonly name: WebToolName;
  readonly arguments: Record<string, unknown>;
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

export const parseWebToolReply = (reply: string): WebToolCall | WebToolCompletion => {
  const parsed: unknown = JSON.parse(protocolJson(reply));
  if (!isRecord(parsed)) throw new Error("Web AI reply must be one JSON object.");
  if (parsed.type === "complete" && typeof parsed.summary === "string") {
    return { type: "complete", summary: parsed.summary };
  }
  if (
    parsed.type === "tool_call" &&
    typeof parsed.name === "string" &&
    isWebToolName(parsed.name) &&
    isRecord(parsed.arguments)
  ) {
    return { type: "tool_call", name: parsed.name, arguments: parsed.arguments };
  }
  throw new Error(
    'Reply must be {"type":"tool_call","name":"...","arguments":{...}} or {"type":"complete","summary":"..."}.',
  );
};

const agentProtocolPrompt = (task: string, permissionMode: PermissionMode): string => {
  return [
    "Act as a coding agent for a local repository. You can request one sandboxed tool per turn.",
    "This JSON conversation protocol is your tool access. Do not look for tools in the website UI.",
    "Your first response must be a grep_code or read_file tool_call, never complete.",
    "Return exactly one JSON object and no prose or Markdown fences.",
    "Tool call shape:",
    '{"type":"tool_call","name":"read_file","arguments":{"path":"README.md"}}',
    "Completion shape:",
    '{"type":"complete","summary":"What changed and verification performed."}',
    "Available tools:",
    '- grep_code: {"pattern":string,"path":string,"glob"?:string}',
    '- read_file: {"path":string,"start_line"?:number,"max_lines"?:number}',
    '- apply_patch: {"patch":string}',
    '- run_tests: {"command":string}',
    "- git_diff: {}",
    `Permission mode: ${permissionMode}.`,
    "Inspect before editing. Keep patches minimal. Run focused tests and git_diff before completion.",
    "Never request shell commands, absolute paths, files outside the repository, or Git commits.",
    "If a tool fails, inspect its result and recover with another valid tool call.",
    "Task:",
    task,
  ].join("\n");
};

const toolResultPrompt = (name: WebToolName, toolResult: ToolResult): string => {
  return [
    "TOOL_RESULT",
    JSON.stringify({ name, ok: toolResult.ok, output: toolResult.output, error: toolResult.error }),
    "Continue with exactly one JSON protocol object.",
  ].join("\n");
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
  for (let turn = 1; turn <= input.maxTurns; turn += 1) {
    input.onProgress?.(`Turn ${turn}/${input.maxTurns}: waiting for the web AI...`);
    const message = await input.engine.ask({ content: nextPrompt, timeoutMs: input.timeoutMs });
    if (message === null) throw new Error(`Web AI returned no reply on agent turn ${turn}.`);
    input.onProgress?.(`Turn ${turn}/${input.maxTurns}: reply received.`);
    let protocolReply: WebToolCall | WebToolCompletion;
    try {
      protocolReply = parseWebToolReply(message.content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      nextPrompt = [
        "PROTOCOL_ERROR",
        `Your previous response was not valid protocol JSON: ${errorMessage}`,
        "Resend exactly one valid JSON object. Escape every quote and newline inside string values.",
      ].join("\n");
      continue;
    }
    if (protocolReply.type === "complete") {
      if (toolCalls === 0) {
        nextPrompt = [
          "PROTOCOL_ERROR",
          "You cannot complete before using a repository tool.",
          "Respond now with one grep_code or read_file tool_call JSON object.",
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
    input.onProgress?.(`Turn ${turn}/${input.maxTurns}: running ${protocolReply.name}...`);
    const toolResult = await executeRepositoryTool({
      repoRoot: input.engine.config.repoPath,
      permissionMode: input.permissionMode,
      name: protocolReply.name,
      args: protocolReply.arguments,
    });
    toolCalls += 1;
    calledTools.add(protocolReply.name);
    input.onProgress?.(
      `Turn ${turn}/${input.maxTurns}: ${protocolReply.name} ${toolResult.ok ? "completed" : "failed"}.`,
    );
    nextPrompt = toolResultPrompt(protocolReply.name, toolResult);
  }
  return {
    completed: false,
    summary: `Stopped after ${input.maxTurns} turns before the web AI reported completion.`,
    turns: input.maxTurns,
    toolCalls,
  };
};

import { describe, expect, it } from "vitest";
import { parseWebToolReply } from "./webToolAgent.ts";

describe("web tool agent protocol", () => {
  it("decodes a repository tool call", () => {
    expect(
      parseWebToolReply('{"type":"tool_call","name":"read_file","arguments":{"path":"README.md"}}'),
    ).toEqual({ type: "tool_call", name: "read_file", arguments: { path: "README.md" } });
  });

  it("decodes a repository tree request", () => {
    expect(
      parseWebToolReply(
        '{"type":"tool_call","name":"list_files","arguments":{"path":"src","depth":2}}',
      ),
    ).toEqual({ type: "tool_call", name: "list_files", arguments: { path: "src", depth: 2 } });
  });

  it("decodes a batch of independent read-only calls", () => {
    expect(
      parseWebToolReply(
        '{"type":"tool_calls","calls":[{"type":"tool_call","name":"list_files","arguments":{"path":"src"}},{"type":"tool_call","name":"read_file","arguments":{"path":"package.json"}}]}',
      ),
    ).toEqual({
      type: "tool_calls",
      calls: [
        { type: "tool_call", name: "list_files", arguments: { path: "src" } },
        { type: "tool_call", name: "read_file", arguments: { path: "package.json" } },
      ],
    });
  });

  it("rejects write tools inside a batch", () => {
    expect(() =>
      parseWebToolReply(
        '{"type":"tool_calls","calls":[{"type":"tool_call","name":"apply_patch","arguments":{"patch":"x"}}]}',
      ),
    ).toThrow("apply_patch must be requested alone");
  });

  it("decodes a raw unified diff without JSON escaping", () => {
    const reply = [
      "APPLY_PATCH",
      "```diff",
      "diff --git a/example.ts b/example.ts",
      "--- a/example.ts",
      "+++ b/example.ts",
      "@@ -1 +1 @@",
      '-export const value = "old";',
      '+export const value = "new";',
      "```",
    ].join("\n");

    expect(parseWebToolReply(reply)).toEqual({
      type: "tool_call",
      name: "apply_patch",
      arguments: {
        patch: [
          "diff --git a/example.ts b/example.ts",
          "--- a/example.ts",
          "+++ b/example.ts",
          "@@ -1 +1 @@",
          '-export const value = "old";',
          '+export const value = "new";',
        ].join("\n"),
      },
    });
  });

  it("accepts an unfenced APPLY_PATCH response", () => {
    const reply = [
      "APPLY_PATCH",
      "diff --git a/example.ts b/example.ts",
      "--- a/example.ts",
      "+++ b/example.ts",
      "@@ -1 +1 @@",
      '-export const value = "old";',
      '+export const value = "new";',
    ].join("\n");

    expect(parseWebToolReply(reply)).toMatchObject({
      type: "tool_call",
      name: "apply_patch",
    });
  });

  it("accepts a standalone diff fence as a patch response", () => {
    const reply = [
      "```patch",
      "--- a/example.ts",
      "+++ b/example.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "```",
    ].join("\n");

    expect(parseWebToolReply(reply)).toMatchObject({
      type: "tool_call",
      name: "apply_patch",
    });
  });

  it("decodes a multiline completion without JSON escaping", () => {
    expect(parseWebToolReply("COMPLETE\nCreated the requested files.\nTests passed.")).toEqual({
      type: "complete",
      summary: "Created the requested files.\nTests passed.",
    });
  });

  it("accepts a fenced JSON reply from a web provider", () => {
    expect(parseWebToolReply('```json\n{"type":"complete","summary":"Done"}\n```')).toEqual({
      type: "complete",
      summary: "Done",
    });
  });

  it("rejects tools outside the repository registry", () => {
    expect(() =>
      parseWebToolReply('{"type":"tool_call","name":"shell","arguments":{"command":"dir"}}'),
    ).toThrow("Invalid tool call object");
  });
});

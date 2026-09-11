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

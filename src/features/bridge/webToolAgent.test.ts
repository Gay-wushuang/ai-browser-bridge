import { describe, expect, it } from "vitest";
import { parseWebToolReply } from "./webToolAgent.ts";

describe("web tool agent protocol", () => {
  it("decodes a repository tool call", () => {
    expect(
      parseWebToolReply('{"type":"tool_call","name":"read_file","arguments":{"path":"README.md"}}'),
    ).toEqual({ type: "tool_call", name: "read_file", arguments: { path: "README.md" } });
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
    ).toThrow("Reply must be");
  });
});

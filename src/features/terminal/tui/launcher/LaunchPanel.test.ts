import { describe, expect, it } from "vitest";
import { editTextAtCursor } from "./LaunchPanel.tsx";

describe("launcher text editing", () => {
  it("inserts text at the cursor", () => {
    expect(editTextAtCursor({ value: "abef", cursor: 2 }, "cd", {})).toEqual({
      value: "abcdef",
      cursor: 4,
    });
  });

  it("backspaces before the cursor", () => {
    expect(editTextAtCursor({ value: "abc", cursor: 2 }, "", { backspace: true })).toEqual({
      value: "ac",
      cursor: 1,
    });
  });

  it("deletes at the cursor", () => {
    expect(editTextAtCursor({ value: "abc", cursor: 1 }, "", { delete: true })).toEqual({
      value: "ac",
      cursor: 1,
    });
  });
});

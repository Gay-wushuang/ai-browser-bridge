import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeRepositoryTool } from "./mcpServer.ts";

const temporaryDirectories: string[] = [];

const repositoryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "bridge-repository-tool-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("repository tool execution", () => {
  it("reads a file through the same validated handler used by MCP", async () => {
    const repoRoot = await repositoryDirectory();
    await writeFile(join(repoRoot, "hello.txt"), "hello from repository tool\n");

    const toolResult = await executeRepositoryTool({
      repoRoot,
      permissionMode: "read-only",
      name: "read_file",
      args: { path: "hello.txt" },
    });

    expect(toolResult.ok).toBe(true);
    expect(toolResult.output).toContain("hello from repository tool");
  });

  it("blocks write tools in read-only mode", async () => {
    const repoRoot = await repositoryDirectory();

    const toolResult = await executeRepositoryTool({
      repoRoot,
      permissionMode: "read-only",
      name: "apply_patch",
      args: { patch: "invalid patch is blocked before execution" },
    });

    expect(toolResult).toMatchObject({
      ok: false,
      error: "permission-mode-read-only",
    });
  });

  it("rejects invalid arguments before a handler runs", async () => {
    const repoRoot = await repositoryDirectory();

    const toolResult = await executeRepositoryTool({
      repoRoot,
      permissionMode: "read-only",
      name: "read_file",
      args: {},
    });

    expect(toolResult).toMatchObject({ ok: false, error: "invalid-tool-arguments" });
  });
});

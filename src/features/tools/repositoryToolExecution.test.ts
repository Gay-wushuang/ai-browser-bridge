import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { executeRepositoryTool } from "./mcpServer.ts";

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

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
  it("lists a bounded repository tree without generated directories", async () => {
    const repoRoot = await repositoryDirectory();
    await mkdir(join(repoRoot, "src", "nested"), { recursive: true });
    await mkdir(join(repoRoot, "node_modules", "ignored"), { recursive: true });
    await writeFile(join(repoRoot, "src", "main.ts"), "export {};\n");
    await writeFile(join(repoRoot, "src", "nested", "feature.ts"), "export {};\n");

    const toolResult = await executeRepositoryTool({
      repoRoot,
      permissionMode: "read-only",
      name: "list_files",
      args: { path: ".", depth: 3 },
    });

    expect(toolResult.ok).toBe(true);
    expect(toolResult.output).toContain("src/");
    expect(toolResult.output).toContain("  main.ts");
    expect(toolResult.output).toContain("    feature.ts");
    expect(toolResult.output).not.toContain("node_modules");
  });

  it("rejects directory traversal when listing files", async () => {
    const repoRoot = await repositoryDirectory();

    const toolResult = await executeRepositoryTool({
      repoRoot,
      permissionMode: "read-only",
      name: "list_files",
      args: { path: ".." },
    });

    expect(toolResult).toMatchObject({ ok: false, error: "tool-handler-error" });
    expect(toolResult.output).toContain("Path escapes repo root");
  });

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

  it("applies a multiline patch supplied as JSON-safe lines", async () => {
    const repoRoot = await repositoryDirectory();
    await execFileAsync("git", ["init"], { cwd: repoRoot });
    const toolResult = await executeRepositoryTool({
      repoRoot,
      permissionMode: "auto",
      name: "apply_patch",
      args: {
        patch_lines: [
          "diff --git a/hello.txt b/hello.txt",
          "new file mode 100644",
          "--- /dev/null",
          "+++ b/hello.txt",
          "@@ -0,0 +1 @@",
          "+hello from patch lines",
        ],
      },
    });

    expect(toolResult.ok).toBe(true);
    expect((await readFile(join(repoRoot, "hello.txt"), "utf8")).replaceAll("\r\n", "\n")).toBe(
      "hello from patch lines\n",
    );

    const diffResult = await executeRepositoryTool({
      repoRoot,
      permissionMode: "read-only",
      name: "git_diff",
      args: {},
    });
    expect(diffResult.ok).toBe(true);
    expect(diffResult.output).toContain("hello.txt");
    expect(diffResult.output).toContain("+hello from patch lines");
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

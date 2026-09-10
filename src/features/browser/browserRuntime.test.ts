import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { browserLaunch, edgeExecutableCandidates } from "./browserRuntime.ts";

describe("browser runtime", () => {
  it("preserves the macOS Chrome launch command", () => {
    const launch = browserLaunch("darwin", ["--remote-debugging-port=9222"], {
      AI_BROWSER_BRIDGE_CHROME_APP: "Google Chrome for Testing",
    });

    expect(launch).toEqual({
      command: "open",
      args: ["-na", "Google Chrome for Testing", "--args", "--remote-debugging-port=9222"],
    });
  });

  it("launches the configured Edge executable directly on Windows", () => {
    const executable = process.execPath;
    const launch = browserLaunch("win32", ["--remote-debugging-port=9222"], {
      AI_BROWSER_BRIDGE_EDGE_EXECUTABLE: executable,
    });

    expect(launch).toEqual({
      command: executable,
      args: ["--remote-debugging-port=9222"],
    });
  });

  it("checks machine-wide and per-user Edge installation paths", () => {
    expect(
      edgeExecutableCandidates(
        "C:\\Program Files",
        "C:\\Program Files (x86)",
        "C:\\Users\\me\\AppData\\Local",
      ),
    ).toEqual([
      join("C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
      join("C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
      join("C:\\Users\\me\\AppData\\Local", "Microsoft", "Edge", "Application", "msedge.exe"),
    ]);
  });

  it("rejects unsupported operating systems", () => {
    expect(() => browserLaunch("linux", [])).toThrow("Unsupported browser platform: linux");
  });
});

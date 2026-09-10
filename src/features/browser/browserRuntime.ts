import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { chromeAppName } from "./browserProfile.ts";

export const EDGE_EXECUTABLE_ENV = "AI_BROWSER_BRIDGE_EDGE_EXECUTABLE";

type BrowserLaunch = {
  readonly command: string;
  readonly args: readonly string[];
};

export interface BrowserRuntime {
  readonly displayName: string;
  readonly launch: (browserArgs: readonly string[]) => void;
  readonly processCommandLines: () => Promise<readonly string[]>;
  readonly isProcessRunning: () => Promise<boolean>;
  readonly terminateOnDebugPort: (port: number) => Promise<void>;
}

const execFileAsync = promisify(execFile);
export const edgeExecutableCandidates = (
  programFiles: string | undefined,
  programFilesX86: string | undefined,
  localAppData: string | undefined,
): readonly string[] => {
  const candidates: string[] = [];
  if (programFiles !== undefined) {
    candidates.push(join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"));
  }
  if (programFilesX86 !== undefined) {
    candidates.push(join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"));
  }
  if (localAppData !== undefined) {
    candidates.push(join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"));
  }
  return candidates;
};

export const windowsEdgeExecutable = (env: NodeJS.ProcessEnv = process.env): string => {
  const configuredExecutable = env[EDGE_EXECUTABLE_ENV]?.trim();
  if (configuredExecutable !== undefined && configuredExecutable.length > 0) {
    if (!existsSync(configuredExecutable)) {
      throw new Error(`${EDGE_EXECUTABLE_ENV} does not exist: ${configuredExecutable}`);
    }
    return configuredExecutable;
  }
  const candidates = edgeExecutableCandidates(
    env.ProgramFiles,
    env["ProgramFiles(x86)"],
    env.LOCALAPPDATA,
  );
  const installedExecutable = candidates.find((candidate) => existsSync(candidate));
  if (installedExecutable !== undefined) return installedExecutable;
  throw new Error(
    `Microsoft Edge was not found. Set ${EDGE_EXECUTABLE_ENV} to the browser executable path.`,
  );
};

export const browserLaunch = (
  platform: NodeJS.Platform,
  browserArgs: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): BrowserLaunch => {
  if (platform === "darwin") {
    return { command: "open", args: ["-na", chromeAppName(env), "--args", ...browserArgs] };
  }
  if (platform === "win32") {
    return { command: windowsEdgeExecutable(env), args: browserArgs };
  }
  throw new Error(`Unsupported browser platform: ${platform}`);
};

const macProcessCommandLines = async (): Promise<readonly string[]> => {
  const { stdout } = await execFileAsync("ps", ["ax", "-o", "command="]);
  return stdout.split("\n");
};

const windowsProcessRows = async (port: number): Promise<readonly string[]> => {
  const remoteDebuggingPortArg = `--remote-debugging-port=${port}`;
  const processCommand = [
    `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${remoteDebuggingPortArg}*' } |`,
    'ForEach-Object { [Console]::Out.WriteLine($_.ProcessId.ToString() + "`t" + $_.CommandLine) }',
  ].join(" ");
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    processCommand,
  ]);
  return stdout.split(/\r?\n/u).filter((line) => line.length > 0);
};

const windowsProcessCommandLines = async (): Promise<readonly string[]> => {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-CimInstance Win32_Process | ForEach-Object { [Console]::Out.WriteLine($_.CommandLine) }",
  ]);
  return stdout.split(/\r?\n/u);
};

const terminateWindowsBrowserOnDebugPort = async (port: number): Promise<void> => {
  const processRows = await windowsProcessRows(port);
  for (const processRow of processRows) {
    const [processIdText] = processRow.split("\t", 1);
    if (processIdText === undefined) continue;
    const processId = Number(processIdText);
    if (!Number.isSafeInteger(processId) || processId <= 0) continue;
    try {
      await execFileAsync("taskkill.exe", ["/PID", String(processId), "/T", "/F"]);
    } catch {
      // The browser process may exit between discovery and termination.
    }
  }
};

const macBrowserRuntime = (): BrowserRuntime => ({
  displayName: "Chrome",
  launch: (browserArgs) => {
    const launch = browserLaunch("darwin", browserArgs);
    const browserProcess = spawn(launch.command, launch.args, { detached: true, stdio: "ignore" });
    browserProcess.unref();
  },
  processCommandLines: macProcessCommandLines,
  isProcessRunning: async () => {
    try {
      const { stdout } = await execFileAsync("pgrep", [
        "-f",
        `${chromeAppName()}.app/Contents/MacOS`,
      ]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  },
  terminateOnDebugPort: async (port) => {
    try {
      await execFileAsync("pkill", ["-f", `--remote-debugging-port=${port}`]);
    } catch {
      // No matching Chrome process owns this debug port.
    }
  },
});

const windowsBrowserRuntime = (): BrowserRuntime => ({
  displayName: "Edge",
  launch: (browserArgs) => {
    const launch = browserLaunch("win32", browserArgs);
    const browserProcess = spawn(launch.command, launch.args, { detached: true, stdio: "ignore" });
    browserProcess.unref();
  },
  processCommandLines: windowsProcessCommandLines,
  isProcessRunning: async () => {
    const executableName = basename(windowsEdgeExecutable());
    const { stdout } = await execFileAsync("tasklist.exe", [
      "/FI",
      `IMAGENAME eq ${executableName}`,
      "/NH",
      "/FO",
      "CSV",
    ]);
    return stdout.toLowerCase().includes(`"${executableName.toLowerCase()}"`);
  },
  terminateOnDebugPort: terminateWindowsBrowserOnDebugPort,
});

export const browserRuntime = (platform: NodeJS.Platform = process.platform): BrowserRuntime => {
  if (platform === "darwin") return macBrowserRuntime();
  if (platform === "win32") return windowsBrowserRuntime();
  throw new Error(`Unsupported browser platform: ${platform}`);
};

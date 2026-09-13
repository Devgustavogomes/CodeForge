import { spawn, spawnSync, ChildProcess, SpawnOptions } from "node:child_process";

export interface ExternalTerminalCommand {
  command: string;
  args: string[];
}

export interface LaunchExternalTerminalOptions {
  execPath?: string;
  scriptPath?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  isAvailable?: (cmd: string) => boolean;
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
}

export const LINUX_TERMINAL_CANDIDATES = [
  "x-terminal-emulator",
  "gnome-terminal",
  "konsole",
  "xfce4-terminal",
  "xterm",
];

export const SUBCOMMAND_FAMILIES = [
  "run",
  "status",
  "spec",
  "task",
  "docs",
  "plan",
  "init",
  "config",
] as const;

const KNOWN_SUBCOMMANDS = new Set([
  ...SUBCOMMAND_FAMILIES,
  "help",
]);

/**
 * Determines whether the CLI should launch in an external terminal window.
 *
 * Root interactive TUI invocation launches externally by default.
 * -i/--inline explicitly suppresses launch, CODEFORGE_EXTERNAL_TERMINAL=1 suppresses recursive spawn,
 * and any CLI subcommand, help flag, or version flag returns false.
 */
export function shouldLaunchExternalTerminal(
  args: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.CODEFORGE_EXTERNAL_TERMINAL === "1") {
    return false;
  }

  const hasInlineFlag =
    args.includes("--inline") ||
    args.includes("-i") ||
    args.some((arg) => arg.startsWith("--inline="));

  if (hasInlineFlag) {
    return false;
  }

  const isHelpOrVersion =
    args.includes("-h") ||
    args.includes("--help") ||
    args.includes("-V") ||
    args.includes("--version");

  if (isHelpOrVersion) {
    return false;
  }

  const hasSubcommand = args.some((arg) => KNOWN_SUBCOMMANDS.has(arg));
  if (hasSubcommand) {
    return false;
  }

  // Only the root interactive TUI invocation (no subcommands/arguments) launches externally
  return args.length === 0;
}

/**
 * Checks if a given command/binary is available in PATH.
 */
export function isExecutableAvailable(cmd: string): boolean {
  try {
    if (process.platform === "win32") {
      const target = cmd.toLowerCase().endsWith(".exe") ? cmd : `${cmd}.exe`;
      const res = spawnSync("where.exe", [target], { stdio: "ignore" });
      if (res.status === 0) return true;
      const resBare = spawnSync("where.exe", [cmd], { stdio: "ignore" });
      return resBare.status === 0;
    }
    const res = spawnSync("sh", ["-c", `command -v "${cmd}"`], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Resolves the preferred terminal emulator on Linux.
 * Checks $TERMINAL first if defined, then candidates in order:
 * x-terminal-emulator, gnome-terminal, konsole, xfce4-terminal, xterm.
 */
export function resolveLinuxTerminal(
  envTerminal?: string,
  isAvailable: (cmd: string) => boolean = isExecutableAvailable,
): string | null {
  if (envTerminal && isAvailable(envTerminal)) {
    return envTerminal;
  }
  for (const candidate of LINUX_TERMINAL_CANDIDATES) {
    if (isAvailable(candidate)) {
      return candidate;
    }
  }
  return null;
}

function escapeShellArg(arg: string): string {
  if (/^[a-zA-Z0-9_./-]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function getWindowsFallbackCommand(
  args: string[],
  _cwd: string,
  execPath: string,
  scriptPath: string,
): ExternalTerminalCommand {
  return {
    command: "cmd.exe",
    args: ["/c", "start", '"CodeForge"', "cmd.exe", "/k", execPath, scriptPath, ...args],
  };
}

export function getWindowsCommand(
  args: string[],
  cwd: string,
  execPath: string,
  scriptPath: string,
  isAvailable: (cmd: string) => boolean = isExecutableAvailable,
): ExternalTerminalCommand {
  const hasWt = isAvailable("wt.exe") || isAvailable("wt");
  if (hasWt) {
    return {
      command: "wt.exe",
      args: ["-d", cwd, "cmd.exe", "/c", execPath, scriptPath, ...args],
    };
  }
  return getWindowsFallbackCommand(args, cwd, execPath, scriptPath);
}

export function getLinuxCommand(
  args: string[],
  _cwd: string,
  execPath: string,
  scriptPath: string,
  envTerminal?: string,
  isAvailable: (cmd: string) => boolean = isExecutableAvailable,
): ExternalTerminalCommand | null {
  const emulator = resolveLinuxTerminal(envTerminal, isAvailable);
  if (!emulator) {
    return null;
  }

  const isGnome = emulator.endsWith("gnome-terminal");
  const flag = isGnome ? "--" : "-e";

  return {
    command: emulator,
    args: [flag, execPath, scriptPath, ...args],
  };
}

export function getMacCommand(
  args: string[],
  cwd: string,
  execPath: string,
  scriptPath: string,
  isAvailable: (cmd: string) => boolean = isExecutableAvailable,
): ExternalTerminalCommand {
  const commandParts = [execPath, scriptPath, ...args];
  const commandStr = commandParts.map(escapeShellArg).join(" ");
  const innerScript = `cd ${escapeShellArg(cwd)} && ${commandStr}`;

  const hasIterm =
    isAvailable("iterm") || isAvailable("iterm2") || isAvailable("iTerm");
  const appleScript = hasIterm
    ? `tell application "iTerm" to create window with default profile command "${escapeAppleScript(innerScript)}"`
    : `tell application "Terminal" to do script "${escapeAppleScript(innerScript)}"`;

  return {
    command: "osascript",
    args: ["-e", appleScript],
  };
}

/**
 * Builds the appropriate command and arguments to launch CodeForge in an external terminal
 * according to the detected or specified platform.
 */
export function getTerminalCommand(
  platform: NodeJS.Platform,
  args: string[],
  cwd: string,
  options?: {
    execPath?: string;
    scriptPath?: string;
    env?: NodeJS.ProcessEnv;
    isAvailable?: (cmd: string) => boolean;
  },
): ExternalTerminalCommand | null {
  const execPath = options?.execPath ?? process.execPath;
  const scriptPath = options?.scriptPath ?? process.argv[1] ?? "codeforge";
  const isAvailable = options?.isAvailable ?? isExecutableAvailable;
  const env = options?.env ?? process.env;

  if (platform === "win32") {
    return getWindowsCommand(args, cwd, execPath, scriptPath, isAvailable);
  }

  if (platform === "darwin") {
    return getMacCommand(args, cwd, execPath, scriptPath, isAvailable);
  }

  // linux and other unix-like operating systems
  return getLinuxCommand(args, cwd, execPath, scriptPath, env.TERMINAL, isAvailable);
}

/**
 * Spawns CodeForge in a detached external terminal window and unrefs the child process.
 *
 * @returns true if successfully launched, false otherwise.
 */
export function launchExternalTerminal(
  args: string[] = process.argv.slice(2),
  cwd: string = process.cwd(),
  options?: LaunchExternalTerminalOptions,
): boolean {
  const platform = options?.platform ?? process.platform;
  const isAvailable = options?.isAvailable ?? isExecutableAvailable;
  const spawnFn = options?.spawnFn ?? spawn;
  const env = options?.env ?? process.env;

  const terminalCmd = getTerminalCommand(platform, args, cwd, {
    execPath: options?.execPath,
    scriptPath: options?.scriptPath,
    env,
    isAvailable,
  });

  if (!terminalCmd) {
    return false;
  }

  const childEnv = {
    ...env,
    CODEFORGE_EXTERNAL_TERMINAL: "1",
  };

  try {
    const child = spawnFn(terminalCmd.command, terminalCmd.args, {
      detached: true,
      stdio: "ignore",
      cwd,
      env: childEnv,
    });

    child.on?.("error", () => {
      // Prevent unhandled error event if process fails to spawn asynchronously
    });

    child.unref?.();
    return true;
  } catch {
    // If Windows wt.exe failed synchronously, fall back to cmd.exe
    if (platform === "win32" && terminalCmd.command === "wt.exe") {
      try {
        const fallbackCmd = getWindowsFallbackCommand(
          args,
          cwd,
          options?.execPath ?? process.execPath,
          options?.scriptPath ?? process.argv[1] ?? "codeforge",
        );
        const child = spawnFn(fallbackCmd.command, fallbackCmd.args, {
          detached: true,
          stdio: "ignore",
          cwd,
          env: childEnv,
        });
        child.on?.("error", () => {});
        child.unref?.();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

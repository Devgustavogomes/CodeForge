import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveLinuxTerminal,
  getTerminalCommand,
  getWindowsCommand,
  getWindowsFallbackCommand,
  getLinuxCommand,
  getMacCommand,
  launchExternalTerminal,
  shouldLaunchExternalTerminal,
  LINUX_TERMINAL_CANDIDATES,
  SUBCOMMAND_FAMILIES,
} from "../../../src/cli/launcher/externalTerminal.js";

describe("externalTerminal launcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("shouldLaunchExternalTerminal", () => {
    describe("default-root launch", () => {
      it("returns true by default when no arguments are passed", () => {
        expect(shouldLaunchExternalTerminal([], {})).toBe(true);
      });

      it("returns true when CODEFORGE_EXTERNAL_TERMINAL is not set in env", () => {
        expect(
          shouldLaunchExternalTerminal([], {
            ...process.env,
            CODEFORGE_EXTERNAL_TERMINAL: undefined,
          }),
        ).toBe(true);
      });
    });

    describe("inline flags (-i, --inline)", () => {
      it("returns false when -i flag is passed", () => {
        expect(shouldLaunchExternalTerminal(["-i"], {})).toBe(false);
      });

      it("returns false when --inline flag is passed", () => {
        expect(shouldLaunchExternalTerminal(["--inline"], {})).toBe(false);
      });

      it("returns false when --inline=true is passed", () => {
        expect(shouldLaunchExternalTerminal(["--inline=true"], {})).toBe(false);
      });

      it("returns false when multiple inline flags are passed", () => {
        expect(shouldLaunchExternalTerminal(["-i", "--inline"], {})).toBe(false);
      });
    });

    describe("recursion prevention (CODEFORGE_EXTERNAL_TERMINAL)", () => {
      it("returns false when CODEFORGE_EXTERNAL_TERMINAL=1 is set", () => {
        const env = { CODEFORGE_EXTERNAL_TERMINAL: "1" };
        expect(shouldLaunchExternalTerminal([], env)).toBe(false);
      });

      it("returns false in child process regardless of arguments", () => {
        const env = { CODEFORGE_EXTERNAL_TERMINAL: "1" };
        expect(shouldLaunchExternalTerminal(["-i"], env)).toBe(false);
        expect(shouldLaunchExternalTerminal(["--inline"], env)).toBe(false);
        expect(shouldLaunchExternalTerminal(["run"], env)).toBe(false);
        expect(shouldLaunchExternalTerminal(["status"], env)).toBe(false);
      });
    });

    describe("registered subcommand families", () => {
      it("returns false for each registered subcommand family with no sub-arguments", () => {
        for (const family of SUBCOMMAND_FAMILIES) {
          expect(shouldLaunchExternalTerminal([family], {})).toBe(false);
        }
      });

      it("returns false for each registered subcommand family with arguments", () => {
        expect(shouldLaunchExternalTerminal(["run", "spec-1"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["status", "spec-1"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["spec", "list"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["spec", "create", "spec-new"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["spec", "delete", "spec-del"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["task", "complete", "spec-1", "TASK-1"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["task", "retry", "spec-1", "TASK-1"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["task", "delete", "spec-1", "TASK-1"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["docs", "create", "spec-1"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["docs", "delete", "arch"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["plan", "generate", "spec-1"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["plan", "validate", "spec-1"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["init"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["config"], {})).toBe(false);
      });

      it("returns false for commander help subcommand", () => {
        expect(shouldLaunchExternalTerminal(["help"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["help", "run"], {})).toBe(false);
      });
    });

    describe("help and version flags", () => {
      it("returns false when -h or --help is passed", () => {
        expect(shouldLaunchExternalTerminal(["-h"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["--help"], {})).toBe(false);
      });

      it("returns false when -V or --version is passed", () => {
        expect(shouldLaunchExternalTerminal(["-V"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["--version"], {})).toBe(false);
      });

      it("returns false when help flag is combined with subcommand", () => {
        expect(shouldLaunchExternalTerminal(["run", "--help"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["spec", "-h"], {})).toBe(false);
      });
    });

    describe("removal of legacy flags (--external, -w)", () => {
      it("returns false when legacy --external flag is passed", () => {
        expect(shouldLaunchExternalTerminal(["--external"], {})).toBe(false);
      });

      it("returns false when legacy -w flag is passed", () => {
        expect(shouldLaunchExternalTerminal(["-w"], {})).toBe(false);
      });

      it("returns false when legacy --external=true is passed", () => {
        expect(shouldLaunchExternalTerminal(["--external=true"], {})).toBe(false);
      });

      it("returns false when subcommand is passed with legacy flag", () => {
        expect(shouldLaunchExternalTerminal(["run", "--external"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["status", "-w"], {})).toBe(false);
      });
    });

    describe("unrecognized commands and options", () => {
      it("returns false when unknown arguments are passed", () => {
        expect(shouldLaunchExternalTerminal(["unknown-cmd"], {})).toBe(false);
        expect(shouldLaunchExternalTerminal(["--unknown-flag"], {})).toBe(false);
      });
    });
  });

  describe("resolveLinuxTerminal", () => {
    it("prioritizes $TERMINAL environment variable if available", () => {
      const isAvailable = vi.fn((cmd) => cmd === "kitty" || cmd === "xterm");
      const resolved = resolveLinuxTerminal("kitty", isAvailable);
      expect(resolved).toBe("kitty");
      expect(isAvailable).toHaveBeenCalledWith("kitty");
    });

    it("falls back to candidate list if $TERMINAL is not available", () => {
      const isAvailable = vi.fn((cmd) => cmd === "gnome-terminal");
      const resolved = resolveLinuxTerminal("unavailable-term", isAvailable);
      expect(resolved).toBe("gnome-terminal");
    });

    it("checks candidates in defined order: x-terminal-emulator, gnome-terminal, konsole, xfce4-terminal, xterm", () => {
      expect(LINUX_TERMINAL_CANDIDATES).toEqual([
        "x-terminal-emulator",
        "gnome-terminal",
        "konsole",
        "xfce4-terminal",
        "xterm",
      ]);

      const isAvailable = vi.fn((cmd) => cmd === "konsole" || cmd === "xterm");
      const resolved = resolveLinuxTerminal(undefined, isAvailable);
      expect(resolved).toBe("konsole");
      expect(isAvailable).toHaveBeenNthCalledWith(1, "x-terminal-emulator");
      expect(isAvailable).toHaveBeenNthCalledWith(2, "gnome-terminal");
      expect(isAvailable).toHaveBeenNthCalledWith(3, "konsole");
    });

    it("returns null if no terminal emulator is available", () => {
      const isAvailable = vi.fn(() => false);
      const resolved = resolveLinuxTerminal(undefined, isAvailable);
      expect(resolved).toBeNull();
    });
  });

  describe("Windows command generation (win32)", () => {
    const cwd = "C:\\projects\\app";
    const execPath = "C:\\Program Files\\nodejs\\node.exe";
    const scriptPath = "C:\\projects\\app\\dist\\cli\\index.js";

    it("uses wt.exe when available", () => {
      const isAvailable = vi.fn((cmd) => cmd === "wt.exe");
      const cmd = getWindowsCommand([], cwd, execPath, scriptPath, isAvailable);

      expect(cmd.command).toBe("wt.exe");
      expect(cmd.args).toEqual([
        "-d",
        cwd,
        "cmd.exe",
        "/c",
        execPath,
        scriptPath,
      ]);
    });

    it("falls back to cmd.exe /c start 'CodeForge' when wt.exe is not available", () => {
      const isAvailable = vi.fn(() => false);
      const cmd = getWindowsCommand([], cwd, execPath, scriptPath, isAvailable);

      expect(cmd.command).toBe("cmd.exe");
      expect(cmd.args).toEqual([
        "/c",
        "start",
        '"CodeForge"',
        "cmd.exe",
        "/k",
        execPath,
        scriptPath,
      ]);
    });

    it("generates fallback command directly via getWindowsFallbackCommand", () => {
      const cmd = getWindowsFallbackCommand([], cwd, execPath, scriptPath);
      expect(cmd.command).toBe("cmd.exe");
      expect(cmd.args).toEqual([
        "/c",
        "start",
        '"CodeForge"',
        "cmd.exe",
        "/k",
        execPath,
        scriptPath,
      ]);
    });
  });

  describe("Linux command generation (linux)", () => {
    const cwd = "/home/user/project";
    const execPath = "/usr/bin/node";
    const scriptPath = "/home/user/project/dist/cli/index.js";

    it("uses -- flag for gnome-terminal", () => {
      const isAvailable = vi.fn((cmd) => cmd === "gnome-terminal");
      const cmd = getLinuxCommand([], cwd, execPath, scriptPath, undefined, isAvailable);

      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe("gnome-terminal");
      expect(cmd!.args).toEqual(["--", execPath, scriptPath]);
    });

    it("uses -e flag for x-terminal-emulator", () => {
      const isAvailable = vi.fn((cmd) => cmd === "x-terminal-emulator");
      const cmd = getLinuxCommand([], cwd, execPath, scriptPath, undefined, isAvailable);

      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe("x-terminal-emulator");
      expect(cmd!.args).toEqual(["-e", execPath, scriptPath]);
    });

    it("uses -e flag for $TERMINAL if defined and available", () => {
      const isAvailable = vi.fn((cmd) => cmd === "alacritty");
      const cmd = getLinuxCommand([], cwd, execPath, scriptPath, "alacritty", isAvailable);

      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe("alacritty");
      expect(cmd!.args).toEqual(["-e", execPath, scriptPath]);
    });

    it("returns null when no Linux terminal emulator is found", () => {
      const isAvailable = vi.fn(() => false);
      const cmd = getLinuxCommand([], cwd, execPath, scriptPath, undefined, isAvailable);
      expect(cmd).toBeNull();
    });
  });

  describe("macOS command generation (darwin)", () => {
    const cwd = "/Users/test/workspace";
    const execPath = "/usr/local/bin/node";
    const scriptPath = "/Users/test/workspace/dist/cli/index.js";

    it("generates osascript command targeting Terminal by default", () => {
      const isAvailable = vi.fn(() => false);
      const cmd = getMacCommand([], cwd, execPath, scriptPath, isAvailable);

      expect(cmd.command).toBe("osascript");
      expect(cmd.args[0]).toBe("-e");
      expect(cmd.args[1]).toContain('tell application "Terminal" to do script');
      expect(cmd.args[1]).toContain(`cd ${cwd}`);
      expect(cmd.args[1]).toContain(`${execPath} ${scriptPath}`);
    });

    it("generates osascript command targeting iTerm when available", () => {
      const isAvailable = vi.fn((bin) => bin === "iTerm" || bin === "iterm2");
      const cmd = getMacCommand([], cwd, execPath, scriptPath, isAvailable);

      expect(cmd.command).toBe("osascript");
      expect(cmd.args[0]).toBe("-e");
      expect(cmd.args[1]).toContain('tell application "iTerm" to create window with default profile command');
      expect(cmd.args[1]).toContain(`cd ${cwd}`);
      expect(cmd.args[1]).toContain(`${execPath} ${scriptPath}`);
    });

    it("safely quotes paths containing spaces in AppleScript command", () => {
      const spaceCwd = "/Users/test/my workspace";
      const spaceScript = "/Users/test/my workspace/dist/index.js";
      const cmd = getMacCommand([], spaceCwd, execPath, spaceScript);

      expect(cmd.command).toBe("osascript");
      expect(cmd.args[1]).toContain(`cd \\"${spaceCwd}\\"`);
      expect(cmd.args[1]).toContain(`\\"${spaceScript}\\"`);
    });
  });

  describe("getTerminalCommand", () => {
    it("routes win32 platform to Windows launcher", () => {
      const isAvailable = vi.fn(() => false);
      const cmd = getTerminalCommand("win32", [], "C:\\app", {
        execPath: "node",
        scriptPath: "index.js",
        isAvailable,
      });

      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe("cmd.exe");
    });

    it("routes darwin platform to macOS launcher", () => {
      const cmd = getTerminalCommand("darwin", [], "/app", {
        execPath: "node",
        scriptPath: "index.js",
      });

      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe("osascript");
    });

    it("routes linux platform to Linux launcher", () => {
      const isAvailable = vi.fn((bin) => bin === "xterm");
      const cmd = getTerminalCommand("linux", [], "/app", {
        execPath: "node",
        scriptPath: "index.js",
        isAvailable,
      });

      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe("xterm");
    });
  });

  describe("launchExternalTerminal", () => {
    it("spawns child process detached, with stdio ignore, unref, and sets CODEFORGE_EXTERNAL_TERMINAL", () => {
      const unrefMock = vi.fn();
      const onMock = vi.fn();
      const spawnMock = vi.fn().mockReturnValue({
        unref: unrefMock,
        on: onMock,
      });

      const isAvailable = vi.fn((cmd) => cmd === "wt.exe");

      const success = launchExternalTerminal([], "C:\\app", {
        platform: "win32",
        execPath: "node.exe",
        scriptPath: "C:\\app\\index.js",
        isAvailable,
        spawnFn: spawnMock as any,
        env: { MY_VAR: "true" },
      });

      expect(success).toBe(true);
      expect(spawnMock).toHaveBeenCalledTimes(1);

      const [command, args, options] = spawnMock.mock.calls[0];
      expect(command).toBe("wt.exe");
      expect(args).toEqual([
        "-d",
        "C:\\app",
        "cmd.exe",
        "/c",
        "node.exe",
        "C:\\app\\index.js",
      ]);

      expect(options.detached).toBe(true);
      expect(options.stdio).toBe("ignore");
      expect(options.cwd).toBe("C:\\app");
      expect(options.env.CODEFORGE_EXTERNAL_TERMINAL).toBe("1");
      expect(options.env.MY_VAR).toBe("true");

      expect(unrefMock).toHaveBeenCalledTimes(1);
      expect(onMock).toHaveBeenCalledWith("error", expect.any(Function));
    });

    it("returns false if terminal command could not be resolved (e.g. unsupported / no emulator)", () => {
      const isAvailable = vi.fn(() => false);
      const spawnMock = vi.fn();

      const success = launchExternalTerminal([], "/app", {
        platform: "linux",
        isAvailable,
        spawnFn: spawnMock as any,
      });

      expect(success).toBe(false);
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it("falls back to cmd.exe if Windows wt.exe throws synchronously on spawn", () => {
      const unrefMock = vi.fn();
      const spawnMock = vi.fn().mockImplementation((cmd) => {
        if (cmd === "wt.exe") {
          throw new Error("Failed to spawn wt.exe");
        }
        return {
          unref: unrefMock,
          on: vi.fn(),
        };
      });

      const isAvailable = vi.fn((cmd) => cmd === "wt.exe");

      const success = launchExternalTerminal([], "C:\\app", {
        platform: "win32",
        execPath: "node.exe",
        scriptPath: "C:\\app\\index.js",
        isAvailable,
        spawnFn: spawnMock as any,
      });

      expect(success).toBe(true);
      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(spawnMock.mock.calls[0][0]).toBe("wt.exe");
      expect(spawnMock.mock.calls[1][0]).toBe("cmd.exe");
      expect(unrefMock).toHaveBeenCalledTimes(1);
    });

    it("returns false if both wt.exe and fallback spawn fail", () => {
      const spawnMock = vi.fn().mockImplementation(() => {
        throw new Error("Fatal spawn error");
      });

      const isAvailable = vi.fn((cmd) => cmd === "wt.exe");

      const success = launchExternalTerminal([], "C:\\app", {
        platform: "win32",
        execPath: "node.exe",
        scriptPath: "C:\\app\\index.js",
        isAvailable,
        spawnFn: spawnMock as any,
      });

      expect(success).toBe(false);
    });
  });
});

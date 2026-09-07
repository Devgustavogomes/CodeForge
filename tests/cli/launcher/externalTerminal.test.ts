import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  stripExternalArgs,
  isExecutableAvailable,
  resolveLinuxTerminal,
  getTerminalCommand,
  getWindowsCommand,
  getWindowsFallbackCommand,
  getLinuxCommand,
  getMacCommand,
  launchExternalTerminal,
  shouldLaunchExternalTerminal,
  LINUX_TERMINAL_CANDIDATES,
} from "../../../src/cli/launcher/externalTerminal.js";

describe("externalTerminal launcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("stripExternalArgs", () => {
    it("strips --external and -w flags from arguments", () => {
      const input = ["run", "my-spec", "--external", "-w", "--other"];
      const result = stripExternalArgs(input);
      expect(result).toEqual(["run", "my-spec", "--other"]);
    });

    it("strips --external=true and --external=false", () => {
      const input = ["status", "--external=true", "spec-a"];
      const result = stripExternalArgs(input);
      expect(result).toEqual(["status", "spec-a"]);
    });

    it("returns an empty array when only external flags are passed", () => {
      expect(stripExternalArgs(["--external"])).toEqual([]);
      expect(stripExternalArgs(["-w"])).toEqual([]);
      expect(stripExternalArgs(["--external", "-w"])).toEqual([]);
    });

    it("preserves arguments when no external flags are present", () => {
      const input = ["spec", "list", "--all"];
      expect(stripExternalArgs(input)).toEqual(["spec", "list", "--all"]);
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
      const cmd = getWindowsCommand(["run", "spec-1"], cwd, execPath, scriptPath, isAvailable);

      expect(cmd.command).toBe("wt.exe");
      expect(cmd.args).toEqual([
        "-d",
        cwd,
        "cmd.exe",
        "/c",
        execPath,
        scriptPath,
        "run",
        "spec-1",
      ]);
    });

    it("falls back to cmd.exe /c start 'CodeForge' when wt.exe is not available", () => {
      const isAvailable = vi.fn(() => false);
      const cmd = getWindowsCommand(["run", "spec-1"], cwd, execPath, scriptPath, isAvailable);

      expect(cmd.command).toBe("cmd.exe");
      expect(cmd.args).toEqual([
        "/c",
        "start",
        '"CodeForge"',
        "cmd.exe",
        "/k",
        execPath,
        scriptPath,
        "run",
        "spec-1",
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
      const cmd = getLinuxCommand(["status"], cwd, execPath, scriptPath, undefined, isAvailable);

      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe("gnome-terminal");
      expect(cmd!.args).toEqual(["--", execPath, scriptPath, "status"]);
    });

    it("uses -e flag for x-terminal-emulator", () => {
      const isAvailable = vi.fn((cmd) => cmd === "x-terminal-emulator");
      const cmd = getLinuxCommand(["status"], cwd, execPath, scriptPath, undefined, isAvailable);

      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe("x-terminal-emulator");
      expect(cmd!.args).toEqual(["-e", execPath, scriptPath, "status"]);
    });

    it("uses -e flag for $TERMINAL if defined and available", () => {
      const isAvailable = vi.fn((cmd) => cmd === "alacritty");
      const cmd = getLinuxCommand(["run"], cwd, execPath, scriptPath, "alacritty", isAvailable);

      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe("alacritty");
      expect(cmd!.args).toEqual(["-e", execPath, scriptPath, "run"]);
    });

    it("returns null when no Linux terminal emulator is found", () => {
      const isAvailable = vi.fn(() => false);
      const cmd = getLinuxCommand(["run"], cwd, execPath, scriptPath, undefined, isAvailable);
      expect(cmd).toBeNull();
    });
  });

  describe("macOS command generation (darwin)", () => {
    const cwd = "/Users/test/workspace";
    const execPath = "/usr/local/bin/node";
    const scriptPath = "/Users/test/workspace/dist/cli/index.js";

    it("generates osascript command executing AppleScript Terminal script", () => {
      const cmd = getMacCommand(["run", "spec-1"], cwd, execPath, scriptPath);

      expect(cmd.command).toBe("osascript");
      expect(cmd.args[0]).toBe("-e");
      expect(cmd.args[1]).toContain('tell application "Terminal" to do script');
      expect(cmd.args[1]).toContain(`cd ${cwd}`);
      expect(cmd.args[1]).toContain(`${execPath} ${scriptPath} run spec-1`);
    });

    it("safely quotes paths containing spaces in AppleScript command", () => {
      const spaceCwd = "/Users/test/my workspace";
      const spaceScript = "/Users/test/my workspace/dist/index.js";
      const cmd = getMacCommand(["run"], spaceCwd, execPath, spaceScript);

      expect(cmd.command).toBe("osascript");
      expect(cmd.args[1]).toContain(`cd \\"${spaceCwd}\\"`);
      expect(cmd.args[1]).toContain(`\\"${spaceScript}\\"`);
    });
  });

  describe("getTerminalCommand", () => {
    it("routes win32 platform to Windows launcher", () => {
      const isAvailable = vi.fn(() => false);
      const cmd = getTerminalCommand("win32", ["run"], "C:\\app", {
        execPath: "node",
        scriptPath: "index.js",
        isAvailable,
      });

      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe("cmd.exe");
    });

    it("routes darwin platform to macOS launcher", () => {
      const cmd = getTerminalCommand("darwin", ["run"], "/app", {
        execPath: "node",
        scriptPath: "index.js",
      });

      expect(cmd).not.toBeNull();
      expect(cmd!.command).toBe("osascript");
    });

    it("routes linux platform to Linux launcher", () => {
      const isAvailable = vi.fn((bin) => bin === "xterm");
      const cmd = getTerminalCommand("linux", ["run"], "/app", {
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

      const success = launchExternalTerminal(["run", "spec-1", "--external", "-w"], "C:\\app", {
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
      // --external and -w must be stripped
      expect(args).toEqual([
        "-d",
        "C:\\app",
        "cmd.exe",
        "/c",
        "node.exe",
        "C:\\app\\index.js",
        "run",
        "spec-1",
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

      const success = launchExternalTerminal(["run"], "/app", {
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

      const success = launchExternalTerminal(["run"], "C:\\app", {
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

      const success = launchExternalTerminal(["run"], "C:\\app", {
        platform: "win32",
        execPath: "node.exe",
        scriptPath: "C:\\app\\index.js",
        isAvailable,
        spawnFn: spawnMock as any,
      });

      expect(success).toBe(false);
    });
  });

  describe("shouldLaunchExternalTerminal", () => {
    it("returns false if already inside an external terminal (CODEFORGE_EXTERNAL_TERMINAL === '1')", () => {
      const env = { CODEFORGE_EXTERNAL_TERMINAL: "1" };
      expect(shouldLaunchExternalTerminal(["--external"], env)).toBe(false);
      expect(shouldLaunchExternalTerminal(["-w"], env)).toBe(false);
      expect(shouldLaunchExternalTerminal(["run", "spec-1"], env, () => true)).toBe(false);
    });

    it("returns true if --external or -w flag is passed", () => {
      expect(shouldLaunchExternalTerminal(["--external"], {})).toBe(true);
      expect(shouldLaunchExternalTerminal(["-w"], {})).toBe(true);
      expect(shouldLaunchExternalTerminal(["run", "spec", "--external"], {})).toBe(true);
      expect(shouldLaunchExternalTerminal(["status", "--external=true"], {})).toBe(true);
    });

    it("returns false if help or version flag is passed without external flag", () => {
      expect(shouldLaunchExternalTerminal(["-h"], {}, () => true)).toBe(false);
      expect(shouldLaunchExternalTerminal(["--help"], {}, () => true)).toBe(false);
      expect(shouldLaunchExternalTerminal(["-V"], {}, () => true)).toBe(false);
      expect(shouldLaunchExternalTerminal(["--version"], {}, () => true)).toBe(false);
    });

    it("returns true if help flag is passed together with explicit external flag", () => {
      expect(shouldLaunchExternalTerminal(["--help", "--external"], {})).toBe(true);
      expect(shouldLaunchExternalTerminal(["-h", "-w"], {})).toBe(true);
    });

    it("returns true if config enables external terminal and no help/version flag", () => {
      expect(shouldLaunchExternalTerminal(["run", "spec-1"], {}, () => true)).toBe(true);
    });

    it("returns false if config disables external terminal", () => {
      expect(shouldLaunchExternalTerminal(["run", "spec-1"], {}, () => false)).toBe(false);
    });

    it("returns false if config check throws an error", () => {
      expect(
        shouldLaunchExternalTerminal(["run"], {}, () => {
          throw new Error("Config read error");
        }),
      ).toBe(false);
    });
  });

  describe("isExecutableAvailable", () => {
    it("returns true for standard system binaries", () => {
      if (process.platform === "win32") {
        expect(isExecutableAvailable("cmd.exe")).toBe(true);
      } else {
        expect(isExecutableAvailable("sh")).toBe(true);
      }
    });

    it("returns false for non-existent binaries", () => {
      expect(isExecutableAvailable("completely_nonexistent_binary_xyz_123")).toBe(false);
    });
  });

  describe("Commander --external / -w option integration", () => {
    it("recognizes --external and -w flags on Commander instance", async () => {
      const { Command } = await import("commander");
      const program = new Command();
      program.option("--external, -w", "Open in a dedicated external terminal window");

      program.parse(["node", "codeforge", "--external"]);
      expect(program.opts().external).toBe(true);

      const programShort = new Command();
      programShort.option("--external, -w", "Open in a dedicated external terminal window");
      programShort.parse(["node", "codeforge", "-w"]);
      expect(programShort.opts().external).toBe(true);
    });
  });
});


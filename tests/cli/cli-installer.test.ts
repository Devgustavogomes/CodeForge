import { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import {
  CliInstaller,
  CLI_INSTALL_COMMANDS,
  CliInstallerDependencies,
} from "../../src/cli/installer/CliInstaller.js";

describe("CliInstaller", () => {
  function controlledProcess(
    event: "close" | "error",
    value: number | Error,
  ): { child: ChildProcess; dependencies: CliInstallerDependencies; spawn: ReturnType<typeof vi.fn> } {
    const child = new EventEmitter() as ChildProcess;
    const spawnMock = vi.fn(() => {
      queueMicrotask(() => child.emit(event, value));
      return child;
    });
    return {
      child,
      spawn: spawnMock,
      dependencies: { spawn: spawnMock },
    };
  }

  it("detects Windows platform correctly", () => {
    expect(CliInstaller.isWindows("win32")).toBe(true);
    expect(CliInstaller.isWindows("darwin")).toBe(false);
    expect(CliInstaller.isWindows("linux")).toBe(false);
  });

  it("returns human-readable OS names", () => {
    expect(CliInstaller.getOperatingSystemName("win32")).toBe("Windows");
    expect(CliInstaller.getOperatingSystemName("darwin")).toBe("macOS");
    expect(CliInstaller.getOperatingSystemName("linux")).toBe("Linux");
  });

  describe("environment install commands", () => {
    const environments = ["antigravity", "codex", "claude", "cursor"];

    it("has configuration for all supported environments", () => {
      for (const env of environments) {
        expect(CLI_INSTALL_COMMANDS[env]).toBeDefined();
        expect(CLI_INSTALL_COMMANDS[env].windowsDisplay).toBeTruthy();
        expect(CLI_INSTALL_COMMANDS[env].unixDisplay).toBeTruthy();
      }
    });

    it("returns correct commands for antigravity (AGY)", () => {
      expect(CliInstaller.getInstallCommand("antigravity", "win32")).toBe(
        "irm https://antigravity.google/cli/install.ps1 | iex",
      );
      expect(CliInstaller.getInstallCommand("antigravity", "linux")).toBe(
        "curl -fsSL https://antigravity.google/cli/install.sh | bash",
      );
    });

    it("returns correct commands for codex", () => {
      expect(CliInstaller.getInstallCommand("codex", "win32")).toBe(
        'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
      );
      expect(CliInstaller.getInstallCommand("codex", "linux")).toBe(
        "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
      );
    });

    it("returns correct commands for claude", () => {
      expect(CliInstaller.getInstallCommand("claude", "win32")).toBe(
        "irm https://claude.ai/install.ps1 | iex",
      );
      expect(CliInstaller.getInstallCommand("claude", "darwin")).toBe(
        "curl -fsSL https://claude.ai/install.sh | bash",
      );
    });

    it("returns correct commands for cursor", () => {
      expect(CliInstaller.getInstallCommand("cursor", "win32")).toBe(
        "irm 'https://cursor.com/install?win32=true' | iex",
      );
      expect(CliInstaller.getInstallCommand("cursor", "linux")).toBe(
        "curl https://cursor.com/install -fsS | bash",
      );
    });

    it("returns null for unknown environment", () => {
      expect(CliInstaller.getInstallCommand("unknown", "win32")).toBeNull();
    });

    it("não cria processo quando o ambiente não exige CLI externa", async () => {
      const spawnMock = vi.fn();

      const result = await CliInstaller.detectCli("local", "linux", {
        spawn: spawnMock,
      });

      expect(result).toEqual({ required: false, available: true, command: null });
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it.each([
      ["win32", "codex"],
      ["darwin", "claude"],
      ["linux", "agy"],
    ] as const)("detecta a CLI no PATH em %s", async (platform, executable) => {
      const process = controlledProcess("close", 0);

      const result = await CliInstaller.detectCli(
        executable === "agy" ? "antigravity" : executable,
        platform,
        process.dependencies,
      );

      expect(result).toMatchObject({ required: true, available: true, executable });
      expect(process.spawn).toHaveBeenCalledWith(
        platform === "win32" ? "where.exe" : "which",
        [executable],
        expect.objectContaining({ shell: false, stdio: "ignore" }),
      );
    });

    it("registra a ausência quando o executável termina com erro", async () => {
      const process = controlledProcess("close", 127);

      const result = await CliInstaller.detectCli("claude", "linux", process.dependencies);

      expect(result).toMatchObject({ required: true, available: false, executable: "claude" });
      expect(result.error).toBeUndefined();
    });

    it("retorna o erro controlado quando não consegue iniciar a detecção", async () => {
      const error = new Error("spawn indisponível");
      const process = controlledProcess("error", error);

      const result = await CliInstaller.detectCli("cursor", "win32", process.dependencies);

      expect(result).toMatchObject({ required: true, available: false, executable: "agent", error });
    });

    it("instala com sucesso por meio da dependência controlada", async () => {
      const process = controlledProcess("close", 0);

      const result = await CliInstaller.installCli("codex", "linux", process.dependencies);

      expect(result).toEqual({ success: true });
      expect(process.spawn).toHaveBeenCalledWith(
        CLI_INSTALL_COMMANDS.codex.unixScript,
        [],
        { shell: true, stdio: "inherit" },
      );
    });

    it("propaga falha da instalação sem executar processo real", async () => {
      const process = controlledProcess("close", 1);

      const result = await CliInstaller.installCli("codex", "win32", process.dependencies);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Process exited with code 1");
    });

    it("fails gracefully when attempting to install an unknown environment", async () => {
      const result = await CliInstaller.installCli("unknown");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});


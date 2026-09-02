import { describe, it, expect } from "vitest";
import { CliInstaller, CLI_INSTALL_COMMANDS } from "../../src/cli/installer/CliInstaller.js";
import { getCodeForgeBanner, CODEFORGE_ASCII } from "../../src/cli/ui/banner.js";

describe("CliInstaller", () => {
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

    it("fails gracefully when attempting to install an unknown environment", async () => {
      const result = await CliInstaller.installCli("unknown");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe("Banner", () => {
  it("generates banner containing CODEFORGE ASCII and description", () => {
    const banner = getCodeForgeBanner();
    expect(banner).toContain(CODEFORGE_ASCII);
    expect(banner).toContain("Deterministic AI Workflow Engine");
  });
});

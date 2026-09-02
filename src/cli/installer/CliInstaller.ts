import { spawn } from "node:child_process";

export interface CliInstallConfig {
  windowsDisplay: string;
  windowsScript: string;
  unixDisplay: string;
  unixScript: string;
}

export const CLI_INSTALL_COMMANDS: Record<string, CliInstallConfig> = {
  antigravity: {
    windowsDisplay: "irm https://antigravity.google/cli/install.ps1 | iex",
    windowsScript: "irm https://antigravity.google/cli/install.ps1 | iex",
    unixDisplay: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    unixScript: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
  },
  codex: {
    windowsDisplay: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
    windowsScript: "irm https://chatgpt.com/codex/install.ps1 | iex",
    unixDisplay: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    unixScript: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
  },
  claude: {
    windowsDisplay: "irm https://claude.ai/install.ps1 | iex",
    windowsScript: "irm https://claude.ai/install.ps1 | iex",
    unixDisplay: "curl -fsSL https://claude.ai/install.sh | bash",
    unixScript: "curl -fsSL https://claude.ai/install.sh | bash",
  },
  cursor: {
    windowsDisplay: "irm 'https://cursor.com/install?win32=true' | iex",
    windowsScript: "irm 'https://cursor.com/install?win32=true' | iex",
    unixDisplay: "curl https://cursor.com/install -fsS | bash",
    unixScript: "curl https://cursor.com/install -fsS | bash",
  },
};

export class CliInstaller {
  static isWindows(platform: NodeJS.Platform = process.platform): boolean {
    return platform === "win32";
  }

  static getOperatingSystemName(platform: NodeJS.Platform = process.platform): string {
    if (platform === "win32") return "Windows";
    if (platform === "darwin") return "macOS";
    if (platform === "linux") return "Linux";
    return platform;
  }

  static getInstallCommand(
    environment: string,
    platform: NodeJS.Platform = process.platform,
  ): string | null {
    const config = CLI_INSTALL_COMMANDS[environment.toLowerCase()];
    if (!config) return null;

    return this.isWindows(platform)
      ? config.windowsDisplay
      : config.unixDisplay;
  }

  static async installCli(
    environment: string,
    platform: NodeJS.Platform = process.platform,
  ): Promise<{ success: boolean; error?: Error }> {
    const config = CLI_INSTALL_COMMANDS[environment.toLowerCase()];
    if (!config) {
      return {
        success: false,
        error: new Error(`Unknown environment for CLI installation: ${environment}`),
      };
    }

    return new Promise((resolve) => {
      try {
        let child;
        if (this.isWindows(platform)) {
          child = spawn(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", config.windowsScript],
            { stdio: "inherit" },
          );
        } else {
          child = spawn(config.unixScript, {
            shell: true,
            stdio: "inherit",
          });
        }

        child.on("error", (err) => {
          resolve({ success: false, error: err });
        });

        child.on("close", (code) => {
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({
              success: false,
              error: new Error(`Process exited with code ${code}`),
            });
          }
        });
      } catch (err) {
        resolve({
          success: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    });
  }
}

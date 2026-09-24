import { ChildProcess, spawn } from "node:child_process";

export interface CliInstallConfig {
  executable: string;
  windowsDisplay: string;
  windowsScript: string;
  unixDisplay: string;
  unixScript: string;
}

export const CLI_INSTALL_COMMANDS: Record<string, CliInstallConfig> = {
  antigravity: {
    executable: "agy",
    windowsDisplay: "irm https://antigravity.google/cli/install.ps1 | iex",
    windowsScript: "irm https://antigravity.google/cli/install.ps1 | iex",
    unixDisplay: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    unixScript: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
  },
  codex: {
    executable: "codex",
    windowsDisplay: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
    windowsScript: "irm https://chatgpt.com/codex/install.ps1 | iex",
    unixDisplay: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    unixScript: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
  },
  claude: {
    executable: "claude",
    windowsDisplay: "irm https://claude.ai/install.ps1 | iex",
    windowsScript: "irm https://claude.ai/install.ps1 | iex",
    unixDisplay: "curl -fsSL https://claude.ai/install.sh | bash",
    unixScript: "curl -fsSL https://claude.ai/install.sh | bash",
  },
  cursor: {
    executable: "agent",
    windowsDisplay: "irm 'https://cursor.com/install?win32=true' | iex",
    windowsScript: "irm 'https://cursor.com/install?win32=true' | iex",
    unixDisplay: "curl https://cursor.com/install -fsS | bash",
    unixScript: "curl https://cursor.com/install -fsS | bash",
  },
};

export interface CliDetectionResult {
  required: boolean;
  available: boolean;
  command: string | null;
  executable?: string;
  error?: Error;
}

export interface CliInstallerDependencies {
  spawn: (
    command: string,
    args: readonly string[],
    options: Parameters<typeof spawn>[2],
  ) => ChildProcess;
}

const DEFAULT_DEPENDENCIES: CliInstallerDependencies = {
  spawn: (command, args, options) => spawn(command, args, options),
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

  /**
   * Verifica a CLI associada ao ambiente sem executar qualquer instalação.
   * A dependência de criação do processo é injetável para manter a operação
   * determinística e segura em testes automatizados.
   */
  static async detectCli(
    environment: string,
    platform: NodeJS.Platform = process.platform,
    dependencies: CliInstallerDependencies = DEFAULT_DEPENDENCIES,
  ): Promise<CliDetectionResult> {
    const command = this.getInstallCommand(environment, platform);
    if (!command) {
      return { required: false, available: true, command: null };
    }

    const config = CLI_INSTALL_COMMANDS[environment.toLowerCase()];

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: CliDetectionResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      try {
        const lookupCommand = this.isWindows(platform) ? "where.exe" : "which";
        const child = dependencies.spawn(lookupCommand, [config.executable], {
          stdio: "ignore",
          windowsHide: true,
          shell: false,
        });

        child.once("error", (error) => {
          finish({
            required: true,
            available: false,
            command,
            executable: config.executable,
            error,
          });
        });
        child.once("close", (code) => {
          finish({
            required: true,
            available: code === 0,
            command,
            executable: config.executable,
          });
        });
      } catch (error: unknown) {
        finish({
          required: true,
          available: false,
          command,
          executable: config.executable,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    });
  }

  static async installCli(
    environment: string,
    platform: NodeJS.Platform = process.platform,
    dependencies: CliInstallerDependencies = DEFAULT_DEPENDENCIES,
  ): Promise<{ success: boolean; error?: Error }> {
    const installCommand = this.getInstallCommand(environment, platform);
    const config = CLI_INSTALL_COMMANDS[environment.toLowerCase()];
    if (!installCommand || !config) {
      return {
        success: false,
        error: new Error(`Unknown environment for CLI installation: ${environment}`),
      };
    }

    return new Promise((resolve) => {
      try {
        let child;
        if (this.isWindows(platform)) {
          child = dependencies.spawn(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", config.windowsScript],
            { stdio: "inherit" },
          );
        } else {
          child = dependencies.spawn(config.unixScript, [], {
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

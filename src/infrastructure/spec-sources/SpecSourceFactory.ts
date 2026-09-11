import { SpecSourceConfig } from "../../domain/spec-source.js";
import { SpecSource } from "../../application/ports/SpecSource.js";
import { FilesystemSpecSource } from "./FilesystemSpecSource.js";
import { LinearSpecSource } from "./LinearSpecSource.js";
import { GitHubSpecSource } from "./GitHubSpecSource.js";
import { ClickUpSpecSource } from "./ClickUpSpecSource.js";

export class SpecSourceFactory {
  static getAvailableProviders(): string[] {
    return ["filesystem", "linear", "github", "clickup"];
  }

  static create(provider: string, config?: SpecSourceConfig): SpecSource {
    switch (provider.toLowerCase()) {
      case "filesystem":
        return new FilesystemSpecSource(config);
      case "linear":
        return new LinearSpecSource(config);
      case "github":
        return new GitHubSpecSource(config);
      case "clickup":
        return new ClickUpSpecSource(config);
      default:
        throw new Error(`Unsupported spec source provider: ${provider}`);
    }
  }

  static getDefaultEnvVar(provider: string): string {
    switch (provider.toLowerCase()) {
      case "github":
        return "GITHUB_TOKEN";
      case "linear":
        return "LINEAR_API_KEY";
      case "clickup":
        return "CLICKUP_API_KEY";
      default:
        return "";
    }
  }

  static getDefaultApiKey(provider: string): string {
    const envVar = this.getDefaultEnvVar(provider);
    return envVar ? `$${envVar}` : "";
  }
}

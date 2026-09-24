import { IntentSourceConfig } from "../../domain/intent-source.js";
import { IntentSource } from "../../application/ports/IntentSource.js";
import { FilesystemIntentSource } from "./FilesystemIntentSource.js";
import { LinearIntentSource } from "./LinearIntentSource.js";
import { GitHubIntentSource } from "./GitHubIntentSource.js";
import { ClickUpIntentSource } from "./ClickUpIntentSource.js";

export class IntentSourceFactory {
  static getAvailableProviders(): string[] {
    return ["filesystem", "linear", "github", "clickup"];
  }

  static create(provider: string, config?: IntentSourceConfig): IntentSource {
    switch (provider.toLowerCase()) {
      case "filesystem":
        return new FilesystemIntentSource(config);
      case "linear":
        return new LinearIntentSource(config);
      case "github":
        return new GitHubIntentSource(config);
      case "clickup":
        return new ClickUpIntentSource(config);
      default:
        throw new Error(`Unsupported intent source provider: ${provider}`);
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

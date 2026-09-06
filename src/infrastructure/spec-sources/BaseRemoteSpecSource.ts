import {
  FetchedSpec,
  SpecReference,
  SpecSourceConfig,
} from "../../domain/spec-source.js";
import {
  ListSpecOptions,
  SpecSource,
} from "../../application/ports/SpecSource.js";

/**
 * Shared utilities for remote spec source implementations (Linear, GitHub, ClickUp).
 * Handles the common patterns of API key resolution, error wrapping, and result filtering.
 */
export abstract class BaseRemoteSpecSource implements SpecSource {
  abstract readonly name: string;

  constructor(protected readonly config?: SpecSourceConfig) {}

  abstract list(options?: ListSpecOptions): Promise<SpecReference[]>;
  abstract fetch(id: string): Promise<FetchedSpec>;

  /**
   * Returns a capitalized/standard display name for user-facing messages.
   */
  protected getProviderDisplayName(): string {
    switch (this.name.toLowerCase()) {
      case "linear":
        return "Linear";
      case "clickup":
        return "ClickUp";
      case "github":
        return "GitHub";
      default:
        return this.name.charAt(0).toUpperCase() + this.name.slice(1);
    }
  }

  /**
   * Reads the API key from the environment using the configured env var name,
   * falling back to the provider-specific default.
   */
  protected getApiKey(defaultEnvVar: string, keyLabel = "API key"): string {
    const envVarName = this.config?.apiKeyEnv || defaultEnvVar;
    const apiKey = process.env[envVarName];
    if (!apiKey) {
      const displayName = this.getProviderDisplayName();
      throw new Error(
        `${displayName} ${keyLabel} not found. Please set the ${envVarName} environment variable or configure apiKeyEnv in .codeforge/config.yaml.`,
      );
    }
    return apiKey;
  }

  /**
   * Wraps a caught error into a consistent Error with a descriptive message
   * that includes the provider name and the operation context.
   */
  protected wrapError(
    operation: "list" | "fetch",
    idOrContext: string,
    error: unknown,
  ): never {
    const displayName = this.getProviderDisplayName();
    const base =
      operation === "list"
        ? `Failed to list specs from ${displayName}`
        : `Failed to fetch spec "${idOrContext}" from ${displayName}`;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${base}: ${message}`, { cause: error });
  }
}

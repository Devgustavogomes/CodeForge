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
   * Default HTTP request timeout in milliseconds (15 seconds).
   */
  public readonly defaultTimeoutMs = 15000;

  /**
   * Reads the API key directly from config.apiKey (literal or interpolated)
   * or falls back to the provider-specific default environment variable.
   */
  public getApiKey(defaultEnvVar: string, keyLabel = "API key"): string {
    const configKey = this.config?.apiKey;
    if (configKey && typeof configKey === "string" && configKey.trim().length > 0) {
      return configKey.trim();
    }

    const envKey = process.env[defaultEnvVar];
    if (envKey && typeof envKey === "string" && envKey.trim().length > 0) {
      return envKey.trim();
    }

    const displayName = this.getProviderDisplayName();
    const envFileMsg = this.config?.envPath
      ? `in the ${this.config.envPath} file`
      : "in the .env file";

    throw new Error(
      `${displayName} ${keyLabel} not found. Please set the ${defaultEnvVar} environment variable ${envFileMsg} or configure apiKey: $${defaultEnvVar} in .codeforge/config.yaml.`,
    );
  }

  /**
   * Executes an HTTP request with a 15-second AbortSignal timeout.
   * Catches timeout errors and produces a user-friendly error message.
   */
  public async fetchWithTimeout(
    url: string | URL,
    init?: RequestInit,
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;

    try {
      return await fetch(url, {
        ...init,
        signal,
      });
    } catch (error: unknown) {
      if (
        (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) ||
        (error as { name?: string })?.name === "TimeoutError" ||
        (error as { code?: string })?.code === "ETIMEDOUT" ||
        (error instanceof Error && /timed? ?out/i.test(error.message))
      ) {
        const displayName = this.getProviderDisplayName();
        throw new Error(
          `Request to ${displayName} timed out after ${timeoutMs / 1000}s. Please check your network connection.`,
          { cause: error },
        );
      }
      throw error;
    }
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


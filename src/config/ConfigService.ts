import yaml from 'yaml';
import { CodeForgeConfig, resolveAiReviewConfig } from './types.js';
import { WorkspaceGateway } from '../infrastructure/workspace.js';
import { PATHS } from '../infrastructure/paths.js';

export class ConfigService {
  private readonly configPath = PATHS.config;

  constructor(private readonly workspace: WorkspaceGateway) {}

  public loadConfig(options: { interpolate?: boolean } = {}): CodeForgeConfig | null {
    try {
      if (!this.workspace.exists(this.configPath)) {
        return null;
      }
      const fileContent = this.workspace.readFile(this.configPath);
      const parsedConfig = (yaml.parse(fileContent) || {}) as Record<string, unknown>;

      // Load environment variables before interpolation
      this.loadEnv(parsedConfig.envPath as string | undefined);

      // Interpolate $VAR and ${VAR} placeholders in string configuration values
      const interpolatedConfig = options.interpolate === false
        ? parsedConfig
        : this.interpolate(parsedConfig) as Record<string, unknown>;

      const rawAiReview = interpolatedConfig.aiReview as Record<string, unknown> | undefined;
      const config: CodeForgeConfig = {
        ...interpolatedConfig,
        language: interpolatedConfig.language ?? 'en',
        // A config file is a complete configuration boundary: callers should not
        // have to distinguish a legacy file with no review section from one that
        // explicitly declares the default review settings.
        aiReview: resolveAiReviewConfig(rawAiReview),
      } as CodeForgeConfig;

      return config;
    } catch (error) {
      console.error('Failed to load config:', error);
      return null;
    }
  }

  public loadEnv(customEnvPath?: string): void {
    if (customEnvPath && this.workspace.exists(customEnvPath)) {
      this.loadEnvFile(customEnvPath);
      return;
    }

    // Default fallback paths: .codeforge/.env followed by root .env
    if (this.workspace.exists(PATHS.codeforgeEnv)) {
      this.loadEnvFile(PATHS.codeforgeEnv);
    }
    if (this.workspace.exists(PATHS.rootEnv)) {
      this.loadEnvFile(PATHS.rootEnv);
    }
  }

  private loadEnvFile(relativePath: string): void {
    try {
      if (!this.workspace.exists(relativePath)) {
        return;
      }
      const content = this.workspace.readFile(relativePath);
      const parsed = this.parseEnv(content);
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    } catch (error) {
      console.error(`Failed to load env file from ${relativePath}:`, error);
    }
  }

  public parseEnv(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const cleanLine = line.startsWith('export ') ? line.slice(7).trim() : line;
      const eqIdx = cleanLine.indexOf('=');
      if (eqIdx === -1) {
        continue;
      }

      const key = cleanLine.slice(0, eqIdx).trim();
      let val = cleanLine.slice(eqIdx + 1).trim();

      if (!key) {
        continue;
      }

      if (
        (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2) ||
        (val.startsWith('`') && val.endsWith('`') && val.length >= 2)
      ) {
        const quoteChar = val[0];
        val = val.slice(1, -1);
        if (quoteChar === '"') {
          val = val.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"');
        }
      } else {
        const commentIdx = val.indexOf('#');
        if (commentIdx !== -1) {
          val = val.slice(0, commentIdx).trim();
        }
      }

      result[key] = val;
    }

    return result;
  }

  public interpolateString(str: string): string {
    return str.replace(
      /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}|\$([a-zA-Z_][a-zA-Z0-9_]*)/g,
      (_, braced, unbraced) => {
        const varName = braced || unbraced;
        return process.env[varName] ?? '';
      }
    );
  }

  public interpolate<T>(value: T): T {
    if (typeof value === 'string') {
      return this.interpolateString(value) as unknown as T;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.interpolate(item)) as unknown as T;
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = this.interpolate(v);
      }
      return result as unknown as T;
    }
    return value;
  }

  public saveConfig(config: CodeForgeConfig | Partial<CodeForgeConfig>): void {
    try {
      let existingRawConfig: Record<string, unknown> = {};
      if (this.workspace.exists(this.configPath)) {
        const fileContent = this.workspace.readFile(this.configPath);
        existingRawConfig = (yaml.parse(fileContent) || {}) as Record<string, unknown>;
      }

      const mergedConfig: Record<string, unknown> = {
        ...existingRawConfig,
      };

      for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) {
          mergedConfig[key] = value;
        }
      }

      // Preserve a reference when an unrelated save passes its resolved value.
      // An explicit new reference or key must replace the old one.
      const existingIntentSource = (existingRawConfig.intentSource) as Record<string, unknown> | undefined;
      const mergedIntentSource = mergedConfig.intentSource as Record<string, unknown> | undefined;
      if (
        existingIntentSource &&
        typeof existingIntentSource.apiKey === 'string' &&
        existingIntentSource.apiKey.includes('$') &&
        mergedIntentSource &&
        typeof mergedIntentSource.apiKey === 'string' &&
        existingIntentSource.provider === mergedIntentSource.provider &&
        mergedIntentSource.apiKey === this.interpolateString(existingIntentSource.apiKey)
      ) {
        mergedIntentSource.apiKey = existingIntentSource.apiKey;
      }


      const yamlContent = yaml.stringify(mergedConfig);
      this.workspace.writeFile(this.configPath, yamlContent);
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }
}

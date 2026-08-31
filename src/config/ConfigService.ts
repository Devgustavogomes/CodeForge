import yaml from 'yaml';
import { CodeForgeConfig } from './types.js';
import { WorkspaceGateway } from '../infrastructure/workspace.js';
import { PATHS } from '../infrastructure/paths.js';

export class ConfigService {
  private readonly configPath = PATHS.config;

  constructor(private readonly workspace: WorkspaceGateway) {}

  public loadConfig(): CodeForgeConfig | null {
    try {
      if (!this.workspace.exists(this.configPath)) {
        return null;
      }
      const fileContent = this.workspace.readFile(this.configPath);
      const config = yaml.parse(fileContent);
      return config as CodeForgeConfig || null;
    } catch (error) {
      console.error('Failed to load config:', error);
      return null;
    }
  }

  public saveConfig(config: CodeForgeConfig): void {
    try {
      const yamlContent = yaml.stringify(config);
      this.workspace.writeFile(this.configPath, yamlContent);
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }
}

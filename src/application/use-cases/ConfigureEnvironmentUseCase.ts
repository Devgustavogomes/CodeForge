import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { ConfigService } from "../../config/ConfigService.js";
import { RunnerFactory } from "../../runners/RunnerFactory.js";
import { CodeForgeConfig } from "../../config/types.js";

export class ConfigureEnvironmentUseCase {
  private readonly configService: ConfigService;

  constructor(private readonly gw: WorkspaceGateway) {
    this.configService = new ConfigService(this.gw);
  }

  getAvailableEnvironments(): string[] {
    return RunnerFactory.getAvailableEnvironments();
  }

  async getAgentsForEnvironment(environment: string): Promise<string[]> {
    const runner = RunnerFactory.createRunner(environment);
    if (runner.getAvailableAgents) {
      return runner.getAvailableAgents();
    }
    return [];
  }

  saveConfig(config: CodeForgeConfig): void {
    this.configService.saveConfig(config);
  }

  loadConfig(): CodeForgeConfig | null {
    return this.configService.loadConfig();
  }
}

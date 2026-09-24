import { ConfigService } from "../../config/ConfigService.js";
import { RunnerFactory } from "../../runners/RunnerFactory.js";
import { CodeForgeConfig } from "../../config/types.js";
import { AgentRunner } from "../../runners/AgentRunner.js";

export type RunnerProvider = (environment: string) => AgentRunner;

export class ConfigureEnvironmentUseCase {
  constructor(
    private readonly configService: ConfigService,
    private readonly runnerProvider: RunnerProvider = (environment: string) =>
      RunnerFactory.createRunner(environment),
  ) {}

  getAvailableEnvironments(): string[] {
    return RunnerFactory.getAvailableEnvironments();
  }

  async getAgentsForEnvironment(environment: string): Promise<string[]> {
    const runner = this.runnerProvider(environment);
    if (runner.getAvailableAgents) {
      return runner.getAvailableAgents();
    }
    return [];
  }

  saveConfig(config: CodeForgeConfig): void {
    const existingConfig = this.loadConfig();
    const mergedConfig: CodeForgeConfig = {
      ...(existingConfig || {}),
      ...config,
    };
    this.configService.saveConfig(mergedConfig);
  }

  loadConfig(): CodeForgeConfig | null {
    return this.configService.loadConfig();
  }
}

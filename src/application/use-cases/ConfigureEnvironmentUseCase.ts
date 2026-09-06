import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { ConfigService } from "../../config/ConfigService.js";
import { RunnerFactory } from "../../runners/RunnerFactory.js";
import { CodeForgeConfig } from "../../config/types.js";
import { ProcessExecutor } from "../../infrastructure/process/ProcessExecutor.js";
import { AgentRunner } from "../../runners/AgentRunner.js";

export type RunnerProvider = (environment: string) => AgentRunner;

export class ConfigureEnvironmentUseCase {
  private readonly configService: ConfigService;
  private readonly runnerProvider: RunnerProvider;

  constructor(
    private readonly gw: WorkspaceGateway,
    configService?: ConfigService | ProcessExecutor,
    runnerProvider?: RunnerProvider,
  ) {
    if (configService && "exec" in configService) {
      this.configService = new ConfigService(this.gw);
      this.runnerProvider =
        runnerProvider ??
        ((environment: string) =>
          RunnerFactory.createRunner(environment, configService as ProcessExecutor));
    } else {
      this.configService =
        (configService as ConfigService) ?? new ConfigService(this.gw);
      this.runnerProvider =
        runnerProvider ??
        ((environment: string) => RunnerFactory.createRunner(environment));
    }
  }

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

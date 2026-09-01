import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { ConfigService } from "../config/ConfigService.js";
import { RunnerFactory } from "../runners/RunnerFactory.js";
import { CodeForgeConfig } from "../config/types.js";

export async function getAgentsForEnvironment(environment: string): Promise<string[]> {
  const runner = RunnerFactory.createRunner(environment);
  if (runner.getAvailableAgents) {
    return runner.getAvailableAgents();
  }
  return [];
}

export function saveConfiguration(
  gw: WorkspaceGateway,
  config: CodeForgeConfig
): void {
  const configService = new ConfigService(gw);
  configService.saveConfig(config);
}

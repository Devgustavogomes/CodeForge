import { RunnerFactory } from "../runners/RunnerFactory.js";
import { getAgentsForEnvironment } from "./configure-environment.js";

export async function getEnvironmentChoices(): Promise<{ name: string; value: string }[]> {
  const environments = RunnerFactory.getAvailableEnvironments();
  return environments.map(env => ({
    name: env,
    value: env
  }));
}

export async function getAgentChoices(environment: string): Promise<{ name: string; value: string }[]> {
  const agents = await getAgentsForEnvironment(environment);
  if (!agents || agents.length === 0) {
    return [];
  }
  return agents.map(agent => ({
    name: agent,
    value: agent
  }));
}

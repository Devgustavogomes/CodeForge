import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { ConfigureEnvironmentUseCase } from "../../src/application/use-cases/ConfigureEnvironmentUseCase.js";
import { CodeForgeConfig } from "../../src/config/types.js";

describe("ConfigureEnvironmentUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let useCase: ConfigureEnvironmentUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    gateway.mkdir(".codeforge");
    useCase = new ConfigureEnvironmentUseCase(gateway);
  });

  it("returns available environments list", () => {
    const envs = useCase.getAvailableEnvironments();
    expect(Array.isArray(envs)).toBe(true);
    expect(envs.length).toBeGreaterThan(0);
  });

  it("returns agents for an environment", async () => {
    const agents = await useCase.getAgentsForEnvironment("antigravity");
    expect(Array.isArray(agents)).toBe(true);
  });

  it("saves and loads configuration", () => {
    const config: CodeForgeConfig = {
      environment: "antigravity",
      plannerAgent: "test-planner",
      executorAgent: "test-executor",
      language: "pt",
    };

    useCase.saveConfig(config);
    const loaded = useCase.loadConfig();

    expect(loaded).toEqual(config);
  });
});

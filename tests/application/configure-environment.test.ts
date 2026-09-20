import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { ConfigureEnvironmentUseCase } from "../../src/application/use-cases/ConfigureEnvironmentUseCase.js";
import { CodeForgeConfig } from "../../src/config/types.js";
import { FakeProcessExecutor } from "../helpers/fake-process-executor.js";

describe("ConfigureEnvironmentUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let fakeExecutor: FakeProcessExecutor;
  let useCase: ConfigureEnvironmentUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    gateway.mkdir(".codeforge");
    fakeExecutor = new FakeProcessExecutor();
    fakeExecutor.registerResponse(/agy models/, {
      stdout: "gemini-1.5-pro\ngemini-1.5-flash\n",
      exitCode: 0,
    });
    useCase = new ConfigureEnvironmentUseCase(gateway, fakeExecutor);
  });

  it("returns available environments list", () => {
    const envs = useCase.getAvailableEnvironments();
    expect(Array.isArray(envs)).toBe(true);
    expect(envs.length).toBeGreaterThan(0);
  });

  it("returns agents for an environment", async () => {
    const agents = await useCase.getAgentsForEnvironment("antigravity");
    expect(Array.isArray(agents)).toBe(true);
    expect(agents).toEqual(["gemini-1.5-pro", "gemini-1.5-flash"]);
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

    expect(loaded).toEqual({
      ...config,
      aiReview: { enabled: false, agent: "default", maxRounds: 3 },
    });
  });
});

import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GeneratePlanUseCase } from "../../src/application/use-cases/GeneratePlanUseCase.js";
import { AgentRunner } from "../../src/runners/AgentRunner.js";
import { CodeForgeConfig } from "../../src/config/types.js";
import { PATHS } from "../../src/infrastructure/paths.js";

function makeWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(PATHS.intentsDir);
  gateway.mkdir(".codeforge/rules");
  gateway.writeFile(".codeforge/metadata.json", JSON.stringify({ initialized: true }));
}

describe("GeneratePlanUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let runner: AgentRunner;
  let config: CodeForgeConfig;
  let useCase: GeneratePlanUseCase;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    runner = { execute: vi.fn().mockResolvedValue(undefined) };
    config = {
      environment: "test",
      plannerAgent: "mock-planner",
      executorAgent: "mock-executor",
      language: "en",
    };
    useCase = new GeneratePlanUseCase(gateway, runner, config);
  });

  it("returns notInitialized if metadata.json is missing", async () => {
    const result = await useCase.execute("auth", "mock-planner");
    expect(result.kind).toBe("not-initialized");
  });

  it("returns intentNotFound if intent does not exist", async () => {
    makeWorkspace(gateway);
    const result = await useCase.execute("missing-intent", "mock-planner");
    expect(result.kind).toBe("intent-not-found");
  });

  it("creates tasks folder, executes runner, and returns result", async () => {
    makeWorkspace(gateway);
    gateway.writeFile(PATHS.intentFile("auth"), "AUTH INTENT");
    gateway.writeFile(".codeforge/rules/planning.md", "PLANNING RULES");

    // Mock runner creates a valid task file when executed
    (runner.execute as any).mockImplementation(async () => {
      gateway.writeFile(".codeforge/tasks/auth/TASK-1.json", JSON.stringify({
        id: "TASK-1",
        title: "T1",
        objective: "O",
        context: "C",
        implementation: "I",
        files: [],
        dependencies: [],
        constraints: [],
        acceptanceCriteria: []
      }));
    });

    const result = await useCase.execute("auth", "mock-planner");

    expect(result.kind).toBe("valid");
    expect(gateway.exists(".codeforge/tasks/auth")).toBe(true);
    expect(runner.execute).toHaveBeenCalled();
  });
});

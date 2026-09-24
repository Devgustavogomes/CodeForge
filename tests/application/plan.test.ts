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

  it.each([undefined, "", "Prefer vertical slices."])("keeps the planning contract with rules %s", async (rules) => {
    makeWorkspace(gateway);
    gateway.writeFile(PATHS.intentFile("auth"), "AUTH INTENT");
    if (rules !== undefined) gateway.writeFile(PATHS.planningRules, rules);

    (runner.execute as any).mockImplementation(async (context: any) => {
      const prompt = gateway.readFile(context.promptFilePath);
      expect(prompt).toContain(".codeforge/tasks/auth/TASK-XXX.json");
      expect(prompt).toContain("Dependencies must reference valid task IDs and form a DAG");
      for (const key of [
        "id", "title", "objective", "context", "implementation", "files",
        "dependencies", "constraints", "acceptanceCriteria",
      ]) expect(prompt).toContain(`"${key}"`);
      expect(prompt).toContain("Write generated prose in en; preserve JSON keys and technical code terms.");
      expect(prompt).toContain("--- TASK SIZE & GRANULARITY ---");
      expect(prompt).toContain("Unit of work");
      expect(prompt).toContain("Granularity");
      expect(prompt).toContain("Aim for a coherent slice");
      if (rules?.trim()) expect(prompt).toContain("Prefer vertical slices.");
      else expect(prompt).not.toContain("PROJECT PLANNING RULES");

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

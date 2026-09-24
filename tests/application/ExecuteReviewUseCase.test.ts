import { beforeEach, describe, expect, it } from "vitest";
import { ExecuteReviewUseCase } from "../../src/application/use-cases/ExecuteReviewUseCase.js";
import { PromptService } from "../../src/application/services/PromptService.js";
import { PATHS } from "../../src/infrastructure/paths.js";
import { GitGateway } from "../../src/infrastructure/git/GitGateway.js";
import { Task } from "../../src/domain/task.js";
import { InMemoryAgentRunner } from "../helpers/in-memory-agent-runner.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";

const task: Task = {
  id: "TASK-001", title: "Initial implementation", objective: "Implement it", context: "Context",
  implementation: "Implement", files: [], dependencies: [], constraints: [], acceptanceCriteria: ["Works"],
};

describe("ExecuteReviewUseCase", () => {
  let workspace: InMemoryWorkspaceGateway;
  let runner: InMemoryAgentRunner;
  let git: GitGateway;

  beforeEach(() => {
    workspace = new InMemoryWorkspaceGateway();
    workspace.writeFile(PATHS.intentFile("review-me"), "The original intent");
    workspace.writeFile(PATHS.reviewRules, "Official review rules");
    workspace.writeFile(PATHS.taskFile("review-me", "TASK-001"), "{}");
    runner = new InMemoryAgentRunner();
    git = {
      hasRepository: () => true,
      getChangedFiles: () => ["src/feature.ts"],
      getFileDiff: () => "+export const feature = true;",
    };
  });

  function createUseCase() {
    return new ExecuteReviewUseCase(workspace, git, runner, new PromptService(workspace), {
      environment: "test", plannerAgent: "planner", executorAgent: "executor", language: "pt", aiReview: { enabled: true, agent: "reviewer-model" },
    });
  }

  it("provides review context, configured model, and returns only newly created task files", async () => {
    runner.withHandler((context) => {
      const prompt = workspace.readFile(context.promptFilePath);
      expect(prompt).toContain("The original intent");
      expect(prompt).toContain("Initial implementation");
      expect(prompt).toContain("src/feature.ts");
      expect(prompt).toContain("Official review rules");
      expect(prompt).toContain("Escreva o texto gerado em português; preserve as chaves JSON e os termos técnicos de código.");
      expect(prompt).not.toContain("MUST be in English");
      expect(prompt).not.toContain("must be in English");
      expect(prompt).toContain("orientações configuradas em português");
      expect(prompt).toContain("TASK-001.json");
      expect(prompt).toContain("Create zero files when approved; silence is the only approval signal.");
      expect(prompt).toContain('"acceptanceCriteria":[]');
      expect(prompt).toContain("continuing from the highest existing task number");
      expect(prompt).toContain("full task graph acyclic");
      expect(prompt).toContain("do not fix source code yourself");
      workspace.writeFile(PATHS.taskFile("review-me", "TASK-002"), "{}");
    });

    await expect(createUseCase().execute({ intentName: "review-me", completedTasks: [task] }))
      .resolves.toEqual({ newTaskIds: ["TASK-002"], newTaskFiles: ["TASK-002.json"] });
    expect(runner.executedContexts[0].model).toBe("reviewer-model");
    expect(workspace.exists(PATHS.reviewPrompt("review-me"))).toBe(false);
  });

  it("approves when the reviewer creates no task files and cleans up after failure", async () => {
    await expect(createUseCase().execute({ intentName: "review-me", completedTasks: [task] }))
      .resolves.toEqual({ newTaskIds: [], newTaskFiles: [] });
    expect(workspace.exists(PATHS.reviewPrompt("review-me"))).toBe(false);

    runner.withError("Reviewer timeout");
    await expect(createUseCase().execute({ intentName: "review-me", completedTasks: [task] }))
      .rejects.toThrow("Reviewer timeout");
    expect(workspace.exists(PATHS.reviewPrompt("review-me"))).toBe(false);
  });

  it("keeps review contract without optional project criteria", async () => {
    workspace.deleteFile(PATHS.reviewRules);
    runner.withHandler((context) => {
      const prompt = workspace.readFile(context.promptFilePath);
      expect(prompt).toContain("--- ORIGINAL INTENT ---");
      expect(prompt).toContain("--- TAREFAS CONCLUÍDAS ---");
      expect(prompt).toContain("Create zero files when approved");
      expect(prompt).toContain("Create task files only for concrete, verified defects.");
      expect(prompt).not.toContain("PROJECT REVIEW CRITERIA");
      expect(prompt).not.toContain("Review rules not found");
    });
    await createUseCase().execute({ intentName: "review-me", completedTasks: [task] });
  });
});

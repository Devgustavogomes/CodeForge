import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    }, "C:/Checkout Directory");
  }


  it("reviews the recorded accumulated range even when the original checkout is unchanged", async () => {
    const accumulatedResult = { directory: "C:/Integration Tree", baseCommit: "original-base", resultCommit: "accepted-result" };
    const rangeGit = {
      ...git,
      getChangedFiles: vi.fn(() => []),
      getFileDiff: vi.fn(() => null),
      getCommitChangedFiles: vi.fn(() => ["new.ts", "deleted.ts", "renamed.ts"]),
      getCommitFileDiff: vi.fn((_directory, _base, _result, file) => "diff --git a/" + file + " b/" + file + "\n+accumulated change"),
    };
    git = rangeGit;
    runner.withHandler(() => {
      const prompt = workspace.readFile(PATHS.reviewPrompt("review-me"));
      expect(prompt).toContain("Original base commit: original-base");
      expect(prompt).toContain("Accepted integration commit: accepted-result");
      expect(prompt).toContain(path.resolve("C:/Checkout Directory", PATHS.tasksDir, "review-me"));
      for (const file of ["new.ts", "deleted.ts", "renamed.ts"]) expect(prompt).toContain("### File: " + file);
    });
    await createUseCase().execute({ intentName: "review-me", completedTasks: [task], accumulatedResult });
    expect(runner.executedContexts[0].cwd).toBe(accumulatedResult.directory);
    expect(rangeGit.getCommitChangedFiles).toHaveBeenCalledWith(accumulatedResult.directory, "original-base", "accepted-result");
    expect(rangeGit.getCommitFileDiff).toHaveBeenCalledTimes(3);
    expect(rangeGit.getChangedFiles).not.toHaveBeenCalled();
    expect(rangeGit.getFileDiff).not.toHaveBeenCalled();
  });

  it("fails instead of reviewing an empty checkout when range support is unavailable", async () => {
    await expect(createUseCase().execute({ intentName: "review-me", completedTasks: [task],
      accumulatedResult: { directory: "integration", baseCommit: "base", resultCommit: "result" },
    })).rejects.toThrow("does not support accumulated-result review");
    expect(runner.executedContexts).toHaveLength(0);
  });

  it("keeps the central prompt path when review executes in a different directory", async () => {
    const cwd = "C:/Review Work Tree";
    await createUseCase().execute({ cwd, intentName: "review-me", completedTasks: [task] });
    expect(runner.executedContexts[0].cwd).toBe(cwd);
    expect(runner.executedContexts[0].promptFilePath).toBe(
      path.resolve("C:/Checkout Directory", PATHS.reviewPrompt("review-me")),
    );
  });

  it("uses the configured model and returns only newly created task files", async () => {
    runner.withHandler(() => {
      workspace.writeFile(PATHS.taskFile("review-me", "TASK-002"), "{}");
    });

    await expect(createUseCase().execute({ intentName: "review-me", completedTasks: [task] }))
      .resolves.toEqual({ newTaskIds: ["TASK-002"], newTaskFiles: ["TASK-002.json"] });
    expect(runner.executedContexts[0].cwd).toBe("C:/Checkout Directory");
    expect(runner.executedContexts[0].promptFilePath).toBe(path.resolve("C:/Checkout Directory", PATHS.reviewPrompt("review-me")));
    expect(runner.executedContexts[0].model).toBe("reviewer-model");
    expect(workspace.exists(PATHS.reviewPrompt("review-me"))).toBe(false);
  });

  it("approves without new tasks and preserves the prompt after failure", async () => {
    await expect(createUseCase().execute({ intentName: "review-me", completedTasks: [task] }))
      .resolves.toEqual({ newTaskIds: [], newTaskFiles: [] });
    expect(workspace.exists(PATHS.reviewPrompt("review-me"))).toBe(false);

    runner.withError("Reviewer timeout");
    await expect(createUseCase().execute({ intentName: "review-me", completedTasks: [task] }))
      .rejects.toThrow("Reviewer timeout");
    expect(workspace.exists(PATHS.reviewPrompt("review-me"))).toBe(true);
  });

  it("approves without creating tasks when optional review rules are absent", async () => {
    workspace.deleteFile(PATHS.reviewRules);
    await expect(createUseCase().execute({ intentName: "review-me", completedTasks: [task] }))
      .resolves.toEqual({ newTaskIds: [], newTaskFiles: [] });
    expect(runner.executedContexts).toHaveLength(1);
    expect(workspace.exists(PATHS.reviewPrompt("review-me"))).toBe(false);
  });
});

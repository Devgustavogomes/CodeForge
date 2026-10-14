import { fakeTaskResultGit } from "../helpers/fake-worktree-lifecycle.js";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TaskExecutor } from "../../src/scheduler/TaskExecutor.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../../src/application/services/PromptService.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { InMemoryAgentRunner } from "../helpers/in-memory-agent-runner.js";
import { HookContext } from "../../src/domain/hook.js";
import { Task } from "../../src/domain/task.js";

describe("task execution directories", () => {
  it("forwards per-task cwd to agents and every task hook while keeping prompts in the checkout", async () => {
    const workspace = new InMemoryWorkspaceGateway();
    const runner = new InMemoryAgentRunner();
    const checkoutCwd = path.resolve("central checkout");
    const repository = new ExecutionStateRepository(workspace);
    const executor = new TaskExecutor(runner, {
      environment: "test", plannerAgent: "p", executorAgent: "e", language: "en",
    }, repository, new PromptService(workspace), checkoutCwd, fakeTaskResultGit());
    const contexts: HookContext[] = [];
    const hooks = { dispatch: async (context: HookContext) => { contexts.push(context); return []; } };
    const task: Task = {
      id: "TASK-001", title: "Task", objective: "O", context: "C", implementation: "I",
      files: [], dependencies: [], constraints: [], acceptanceCriteria: [],
    };
    const directories = [path.resolve("work trees/task one"), path.resolve("work trees/task two")];
    repository.save(repository.init("intent", [task, { ...task, id: "TASK-002" }]));
    directories.forEach((cwd, index) => repository.updateTask("intent", "TASK-00" + (index + 1), (record, state) => {
      state.repositoryPath = checkoutCwd;
      record.worktreePath = cwd; record.branch = "codex/test"; record.baseCommit = "a".repeat(40);
      record.stages = { preparation: { status: "succeeded" } };
    }));
    await Promise.all(directories.map((cwd, index) =>
      executor.executeTask("intent", { ...task, id: "TASK-00" + (index + 1) }, { cwd, hooks }),
    ));
    expect(Object.values(repository.load("intent")?.tasks ?? {}).flatMap((record) => record.errors ?? [])).toEqual([]);
    expect(runner.executedContexts.map((context) => context.cwd)).toEqual(directories);
    for (const [index, cwd] of directories.entries()) {
      const taskId = "TASK-00" + (index + 1);
      expect(runner.executedContexts[index].promptFilePath).toBe(
        path.resolve(checkoutCwd, ".codeforge/executions/intent/" + taskId + ".temp.prompt.md"),
      );
      const taskHooks = contexts.filter((context) => context.taskId === taskId);
      expect(taskHooks.map((context) => context.event)).toEqual(["task.started", "task.verify", "task.completed"]);
      expect(taskHooks.every((context) => context.cwd === cwd)).toBe(true);
    }
  });
});

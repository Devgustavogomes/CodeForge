import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fakeTaskResultGit } from "../helpers/fake-worktree-lifecycle.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptService, executeWithTempPrompt } from "../../src/application/services/PromptService.js";
import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
import { PATHS } from "../../src/infrastructure/paths.js";
import { ExecuteReviewUseCase } from "../../src/application/use-cases/ExecuteReviewUseCase.js";
import { TaskStorage } from "../../src/scheduler/TaskStorage.js";
import { TaskExecutor } from "../../src/scheduler/TaskExecutor.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { InMemoryAgentRunner } from "../helpers/in-memory-agent-runner.js";
import { TaskBuilder } from "../helpers/task-builder.js";

const intent = "isolated";

describe("PromptService with a central checkout and isolated worktree", () => {
  let directory: string;
  let central: string;
  let execution: string;
  let gateway: NodeWorkspaceGateway;
  let service: PromptService;
  const task = TaskBuilder.aTask().withFiles(["src/existing.ts", "src/new.ts"]).build();

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "codeforge prompt "));
    central = path.join(directory, "central checkout");
    execution = path.join(directory, "task worktree");
    gateway = new NodeWorkspaceGateway(central);
    gateway.mkdir(PATHS.intentsDir);
    gateway.mkdir(PATHS.rulesDir);
    gateway.mkdir(PATHS.docsDir);
    gateway.mkdir(path.join(PATHS.tasksDir, intent));
    gateway.writeFile(PATHS.intentFile(intent), "Central intent");
    gateway.writeFile(PATHS.runningRules, "Follow the project architecture.");
    gateway.writeFile(PATHS.reviewRules, "Verify concrete defects.");
    gateway.writeFile(PATHS.docsDir + "/architecture.md", "Central documentation");
    gateway.writeFile(PATHS.taskFile(intent, task.id), JSON.stringify(task));
    fs.mkdirSync(path.join(execution, "src"), { recursive: true });
    fs.writeFileSync(path.join(execution, "src/existing.ts"), "worktree content");
    service = new PromptService(new NodeWorkspaceGateway(execution, central), central);
  });

  afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

  it("resolves prompt, task, intent, rules and documentation without worktree metadata", () => {
    const promptPath = service.createPromptFile(intent, task, "en", undefined, {
      orchestrationRoot: central, executionRoot: execution,
    });
    expect(path.isAbsolute(promptPath)).toBe(true);
    const prompt = fs.readFileSync(promptPath, "utf8");
    for (const relative of [PATHS.intentFile(intent), PATHS.taskFile(intent, task.id), PATHS.runningRules, PATHS.docsDir]) {
      const reference = path.resolve(central, relative);
      expect(prompt).toContain(reference);
      expect(fs.existsSync(reference)).toBe(true);
    }
    expect(prompt).toContain("Follow the project architecture.");
    expect(prompt).toContain("Objective: " + task.objective);
    expect(fs.existsSync(path.join(execution, ".codeforge"))).toBe(false);
  });

  it("inspects source existence and references in the task worktree despite later checkout changes", () => {
    gateway.mkdir("src");
    gateway.writeFile("src/new.ts", "original checkout only");
    const promptPath = service.createPromptFile(intent, task, "en", undefined, {
      orchestrationRoot: central, executionRoot: execution,
    });
    const prompt = fs.readFileSync(promptPath, "utf8");
    const existing = prompt.split("### File: src/existing.ts")[1].split("### File: src/new.ts")[0];
    expect(existing).toContain(path.join(execution, "src/existing.ts"));
    expect(existing).not.toContain("does not exist");
    expect(prompt.split("### File: src/new.ts")[1]).toContain("does not exist yet");
    expect(fs.readFileSync(path.join(execution, "src/existing.ts"), "utf8")).toBe("worktree content");
  });

  it("retains failed prompts and replays errors and diagnostics in the same execution directory", async () => {
    const repository = new ExecutionStateRepository(gateway);
    repository.save(repository.init(intent, [task]));
    repository.updateTask(intent, task.id, (record, state) => {
      state.repositoryPath = central;
      record.worktreePath = execution; record.branch = "codex/test"; record.baseCommit = "a".repeat(40);
      record.stages = { preparation: { status: "succeeded" } };
    });
    const runner = new InMemoryAgentRunner().withError("Agent interrupted");
    const executor = new TaskExecutor(runner, {
      environment: "test", plannerAgent: "p", executorAgent: "e", language: "en",
    }, repository, service, central, fakeTaskResultGit());
    await executor.executeTask(intent, task, { cwd: execution });
    const promptPath = runner.executedContexts[0].promptFilePath;
    expect(fs.existsSync(promptPath)).toBe(true);
    repository.updateTask(intent, task.id, (record) => {
      (record.diagnostics ??= []).push({ stage: "verification", message: "Previous gate output", recordedAt: new Date().toISOString() });
    });
    runner.withSuccess().withHandler((context) => {
      expect(context.cwd).toBe(execution);
      const prompt = fs.readFileSync(context.promptFilePath, "utf8");
      expect(prompt).toContain("CodeForge task retry");
      expect(prompt).toContain("Agent interrupted");
      expect(prompt).toContain("Previous gate output");
      expect(prompt).toContain("Execution directory: " + execution);
    });
    await executor.executeTask(intent, task, { cwd: execution });
    expect(runner.executedContexts).toHaveLength(2);
    expect(repository.load(intent)?.tasks[task.id].status).toBe("completed");
  });

  it("preserves previous context without starting a runner when its environment is occupied", async () => {
    const repository = new ExecutionStateRepository(gateway);
    repository.save(repository.init(intent, [task]));
    repository.updateTask(intent, task.id, (record) => {
      record.status = "running";
      record.worktreePath = execution;
      record.startedAt = new Date().toISOString();
    });
    vi.spyOn(repository, "inspectEnvironment").mockResolvedValue({
      safeToReuse: false, status: "active", diagnostics: ["Previous process is active"],
    } as Awaited<ReturnType<typeof repository.inspectEnvironment>>);
    const promptPath = service.createPromptFile(intent, task, "en", ["Recovery diagnostic"], {
      orchestrationRoot: central, executionRoot: execution,
    });
    const before = fs.readFileSync(promptPath, "utf8");
    const runner = new InMemoryAgentRunner();
    const executor = new TaskExecutor(runner, {
      environment: "test", plannerAgent: "p", executorAgent: "e", language: "en",
    }, repository, service, central);
    await executor.executeTask(intent, task, { cwd: execution });
    expect(repository.load(intent)?.tasks[task.id].errors?.join(" ")).toContain("still occupies");
    expect(runner.executedContexts).toHaveLength(0);
    expect(fs.readFileSync(promptPath, "utf8")).toBe(before);
  });

  it("directs review task output and task storage to the central store", () => {
    const promptPath = service.createReviewPromptFile(intent, [task], "diff", [task.id + ".json"], "en", {
      orchestrationRoot: central, executionRoot: execution,
    });
    const prompt = fs.readFileSync(promptPath, "utf8");
    expect(prompt).toContain(path.join(central, PATHS.tasksDir, intent, "TASK-XXX.json"));
    expect(prompt).toContain('"acceptanceCriteria":[]');
    const storage = new TaskStorage(new NodeWorkspaceGateway(execution, central));
    expect(storage.loadTasks(intent)).toEqual([task]);
    gateway.writeFile(PATHS.taskFile(intent, "TASK-002"), "{}");
    storage.cleanupReviewOutput(intent, new Set([task.id + ".json"]));
    expect(storage.listJsonTaskFiles(intent)).toEqual([task.id + ".json"]);
    expect(fs.existsSync(path.join(execution, ".codeforge"))).toBe(false);
  });

  it("discovers central review output when the review runs in a worktree", async () => {
    const runner = new InMemoryAgentRunner().withHandler((context) => {
      expect(context.cwd).toBe(execution);
      expect(path.isAbsolute(context.promptFilePath)).toBe(true);
      const prompt = fs.readFileSync(context.promptFilePath, "utf8");
      expect(prompt).toContain(path.join(central, PATHS.tasksDir, intent, "TASK-XXX.json"));
      gateway.writeFile(PATHS.taskFile(intent, "TASK-002"), JSON.stringify({ ...task, id: "TASK-002" }));
    });
    const review = new ExecuteReviewUseCase(new NodeWorkspaceGateway(execution, central), {
      hasRepository: () => true, getChangedFiles: () => [], getFileDiff: () => "",
    }, runner, service, {
      environment: "test", plannerAgent: "p", executorAgent: "e", language: "en",
    }, central);
    await expect(review.execute({ cwd: execution, intentName: intent, completedTasks: [task] }))
      .resolves.toEqual({ newTaskFiles: ["TASK-002.json"], newTaskIds: ["TASK-002"] });
    expect(fs.existsSync(path.join(execution, ".codeforge"))).toBe(false);
  });

  it("preserves temporary context when an operation rejects", async () => {
    const promptPath = PATHS.executionsDir + "/interrupted.prompt.md";
    await expect(executeWithTempPrompt(gateway, promptPath, "Recovery context", async () => {
      throw new Error("Interrupted");
    })).rejects.toThrow("Interrupted");
    expect(gateway.readFile(promptPath)).toBe("Recovery context");
  });
});

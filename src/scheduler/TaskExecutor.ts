import { NodeProcessExecutor } from "../infrastructure/process/NodeProcessExecutor.js";
import { AgentRunner, TaskContext } from "../runners/AgentRunner.js";
import { CodeForgeConfig } from "../config/types.js";
import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../application/services/PromptService.js";
import { Task } from "../domain/task.js";
import { HookContext, HookEvent } from "../domain/hook.js";
import { TaskExecutionContext, TaskResultGit } from "./types.js";
import { HookDispatcher } from "../application/ports/HookDispatcher.js";

import path from "node:path";
import { randomUUID } from "node:crypto";
import { NodeGitGateway } from "../infrastructure/git/NodeGitGateway.js";
import { ExecutionOperation, ExecutionStage } from "../domain/execution.js";

export class TaskExecutor {
  private readonly active = new Set<string>();
  constructor(
    private runner: AgentRunner,
    private config: CodeForgeConfig,
    private stateRepo: ExecutionStateRepository,
    private promptService: PromptService,
    private readonly checkoutCwd: string = process.cwd(),
    private readonly git: TaskResultGit = new NodeGitGateway(checkoutCwd),
  ) {}

  private createHookContext(
    event: HookEvent,
    intentName: string,
    cwd: string,
    taskId?: string,
    errors?: string[],
  ): HookContext {
    return {
      event,
      intentName,
      cwd,
      onProcessRecord: this.stateRepo.load(intentName) ? this.stateRepo.processReporter(intentName) : undefined,
      ...(taskId ? { taskId } : {}),
      ...(errors ? { errors } : {}),
    };
  }

  private async dispatchHooks(context: HookContext, hooks: HookDispatcher | undefined) {
    const results = await hooks?.dispatch(context);
    const notifications = (results ?? []).filter(result => !result.ok &&
      (result.type === "notify" || context.event === "task.completed" || context.event === "task.failed"));
    if (notifications.length && context.taskId) this.stateRepo.updateTask(context.intentName, context.taskId, record => {
      for (const result of notifications) (record.diagnostics ??= []).push({
        stage: record.stage ?? "execution", recordedAt: new Date().toISOString(), attempt: record.attempt,
        message: 'Hook "' + result.name + '" failed with exit code ' + result.exitCode + '.\n' + result.output,
      });
    });
    return results;
  }

  async verify(intentName: string, taskId: string, hooks: HookDispatcher | undefined, cwd: string,
    event: "task.started" | "task.verify" = "task.verify"): Promise<void> {
    const results = await this.dispatchHooks(this.createHookContext(event, intentName, cwd, taskId), hooks);

    const vetoes = (results ?? []).filter((r) => r.type === "gate" && !r.ok);
    if (vetoes.length === 0) {
      return;
    }

    throw new Error(
      vetoes
        .map(
          (v) =>
            `Gate hook "${v.name}" failed with exit code ${v.exitCode}.\n${v.output}`,
        )
        .join("\n\n"),
    );
  }

  private boundary(intentName: string, taskId: string, stage: ExecutionStage): void {
    this.stateRepo.updateTask(intentName, taskId, record => {
      const now = new Date().toISOString();
      if (record.stage && record.stages?.[record.stage]?.status === "running") {
        Object.assign(record.stages[record.stage]!, { status: "succeeded", completedAt: now });
      }
      record.stage = stage;
      (record.stages ??= {})[stage] = { status: "running", startedAt: now };
    });
  }

  private commitResult(intentName: string, taskId: string, cwd: string): void {
    const state = this.stateRepo.load(intentName)!;
    const task = state.tasks[taskId];
    const info = this.git.getRepositoryInfo(cwd);
    if (!state.runId || !state.repositoryPath || !task.branch || !task.baseCommit ||
        info.branch !== task.branch || !info.head || !this.git.isAncestor(cwd, task.baseCommit, info.head)) {
      throw new Error("Task Git identity differs from its prepared worktree.");
    }
    const pending = state.operations?.filter(op => op.kind === "commit" && op.taskId === taskId && op.status === "intended").at(-1);
    let operation: ExecutionOperation;
    let result: string;
    if (pending) {
      if (task.stages?.verification?.status !== "succeeded") throw new Error("Interrupted result has no gate approval evidence.");
      operation = pending;
      if (pending.expectedAfter.worktreePath !== cwd || pending.expectedAfter.branch !== info.branch ||
          pending.runId !== state.runId || this.git.getStatus(cwd).some(entry => entry.kind !== "ignored")) {
        throw new Error("Interrupted commit has unresolved changes or ownership; preserve it for recovery.");
      }
      const noChange = pending.expectedAfter.headCommit === pending.before.headCommit;
      if (noChange ? info.head !== pending.before.headCommit :
          !this.git.getCommitMessage(cwd, info.head).split(/\r?\n/).includes("CodeForge-Operation: " + pending.id)) {
        throw new Error("Interrupted commit has no matching Git evidence; inspect it before retrying.");
      }
      result = info.head;
    } else {
      this.git.stageAll(cwd);
      const changed = this.git.getStatus(cwd).some(entry => entry.kind !== "ignored");
      const identity = { repositoryPath: state.repositoryPath, branch: task.branch,
        worktreePath: cwd, headCommit: info.head, exists: true };
      operation = {
        id: randomUUID(), runId: state.runId, taskId, attempt: task.attempt ?? 0,
        kind: "commit", status: "intended", intendedAt: new Date().toISOString(),
        before: identity, expectedAfter: { ...identity, headCommit: changed ? null : info.head },
      };
      this.stateRepo.updateTask(intentName, taskId, (record, current) => {
        (current.operations ??= []).push(operation);
        record.stage = "commit";
        (record.stages ??= {}).commit = { status: "running", startedAt: operation.intendedAt, operationId: operation.id };
      });
      try {
        result = changed ? this.git.commit(cwd,
          "CodeForge task " + taskId + " result\n\nCodeForge-Operation: " + operation.id) : info.head;
      } catch (error) {
        // A failed Git command leaves code and index intact for the next attempt.
        // If Git actually advanced HEAD, retain the intent for reconciliation.
        if (this.git.getRepositoryInfo(cwd).head === info.head) {
          this.stateRepo.recordOperationOutcome(intentName, operation.id, "failed", {
            recordedAt: new Date().toISOString(), after: identity, diagnostics: [String(error)],
          });
        }
        throw error;
      }
    }
    const after = this.git.getRepositoryInfo(cwd);
    if (after.branch !== task.branch || after.head !== result ||
        this.git.getStatus(cwd).some(entry => entry.kind !== "ignored")) {
      throw new Error("Result commit did not preserve all versionable task changes.");
    }
    // Outcome, commit evidence and completion share one atomic state transition.
    this.stateRepo.updateTask(intentName, taskId, (record, current) => {
      const saved = current.operations?.find(op => op.id === operation.id);
      if (!saved || saved.status !== "intended") throw new Error("Commit operation ownership changed.");
      const now = new Date().toISOString();
      saved.status = "succeeded";
      saved.outcome = { recordedAt: now, after: { ...operation.expectedAfter, headCommit: result },
        diagnostics: result === operation.before.headCommit ? ["Approved no-change result; existing HEAD recorded."] : [] };
      record.resultCommit = result;
      record.status = "completed";
      record.completedAt = now;
      record.stage = "commit";
      (record.stages ??= {}).commit = { ...record.stages?.commit, status: "succeeded", completedAt: now, operationId: operation.id };
      record.integration = { status: "pending", resultCommit: result };
      delete record.errors;
    });
  }

  async resolveConflict(intentName: string, task: Task, context: TaskExecutionContext): Promise<void> {
    const resolution = this.stateRepo.load(intentName)!.tasks[task.id].integration!.resolution!;
    const promptFilePath = this.promptService.createConflictPromptFile(intentName, task, this.config.language,
      resolution, { orchestrationRoot: this.checkoutCwd, executionRoot: context.cwd });
    this.stateRepo.updateTask(intentName, task.id, record => {
      (record.integration!.resolution!.promptPaths ??= []).push(promptFilePath);
    });
    const runnerContext: TaskContext = {
      cwd: context.cwd, promptFilePath, intentName, taskId: task.id, model: context.model, silent: true,
      onProcessRecord: this.stateRepo.processReporter(intentName),
      onLog: chunk => context.reporter?.onLog?.(task.id, chunk),
    };
    if (this.runner.runTask) await this.runner.runTask(runnerContext);
    else await this.runner.execute(runnerContext);
  }

  async executeTask(intentName: string, task: Task, context: TaskExecutionContext): Promise<void> {
    const key = intentName + ":" + task.id;
    if (this.active.has(key)) throw new Error("Task execution is already owned in this orchestrator.");
    this.active.add(key);
    let cwd: string | undefined;
    let stage: ExecutionStage = "preparation";
    let approved = false;
    try {
      const state = this.stateRepo.load(intentName);
      const previous = state?.tasks[task.id];
      if (!state?.runId || !previous) throw new Error("Persisted task execution state is required.");
      if (previous.status === "completed") return;
      if (state.processes?.some(record => record.taskId === task.id) || previous.owner || previous.status === "running" ||
          Object.values(previous.stages ?? {}).some(item => item.status === "blocked")) {
        const occupancy = await this.stateRepo.inspectEnvironment(intentName, new NodeProcessExecutor(), { taskId: task.id });
        if (!occupancy.safeToReuse) throw new Error("Previous execution still occupies this task environment: " +
          occupancy.status + ". " + occupancy.diagnostics.join(" "));
      }
      const previousErrors = [...new Set([...(previous.errors ?? []),
        ...(previous.diagnostics?.map(entry => entry.message) ?? [])])];
      const recoveringCommit = state.operations?.some(op => op.taskId === task.id && op.kind === "commit" && op.status === "intended");
      // Explicit retries of failed gates need the agent to repair the code first.
      const recoveringVerification = previous.status === "pending" && !recoveringCommit && (previous.stage === "verification" || previous.stage === "commit") &&
        previous.stages?.execution?.status === "succeeded" && previous.stages?.preparation?.status === "succeeded" &&
        previous.stages?.verification?.status !== "failed";
      this.stateRepo.updateTask(intentName, task.id, (record, current) => {
        record.status = "running";
        record.startedAt = new Date().toISOString();
        if (!recoveringCommit && !recoveringVerification) record.attempt = (record.attempt ?? 0) + 1;
        delete record.completedAt;
        current.startedAt ??= record.startedAt;
      });
      if (!recoveringCommit && !recoveringVerification && context.prepareWorktree) this.boundary(intentName, task.id, "preparation");
      const owned = await context.prepareWorktree?.();
      const preparedState = this.stateRepo.load(intentName)!;
      const prepared = preparedState.tasks[task.id];
      const directory = owned?.directory ?? context.cwd;
      const normalize = (value: string) => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
      if (!prepared.worktreePath || normalize(directory) !== normalize(prepared.worktreePath) ||
          normalize(directory) === normalize(state.originalWorktreePath ?? this.checkoutCwd) ||
          prepared.stages?.preparation?.status !== "succeeded") {
        throw new Error("An isolated, successfully prepared task worktree is required.");
      }
      const identity = this.git.getRepositoryInfo(prepared.worktreePath);
      if (!preparedState.repositoryPath || identity.branch !== prepared.branch || !identity.head || !prepared.baseCommit ||
          !this.git.isAncestor(prepared.worktreePath, prepared.baseCommit, identity.head)) {
        throw new Error("Task Git identity differs from its prepared worktree.");
      }
      cwd = prepared.worktreePath;
      if (recoveringCommit) {
        stage = "commit";
        this.commitResult(intentName, task.id, cwd);
      } else if (recoveringVerification) {
        stage = "verification";
        this.boundary(intentName, task.id, stage);
        await this.verify(intentName, task.id, context.hooks, cwd);
        stage = "commit";
        this.boundary(intentName, task.id, stage);
        this.commitResult(intentName, task.id, cwd);
      } else {
        stage = "execution";
        this.boundary(intentName, task.id, stage);
        context.reporter?.onUpdate(intentName);
        await this.verify(intentName, task.id, context.hooks, cwd, "task.started");
        const promptPath = this.promptService.createPromptFile(intentName, task, this.config.language,
          previousErrors, { orchestrationRoot: this.checkoutCwd, executionRoot: cwd });
        const runnerContext: TaskContext = {
          cwd, promptFilePath: promptPath, intentName, taskId: task.id, model: context.model, silent: true,
          onProcessRecord: this.stateRepo.processReporter(intentName),
          onLog: chunk => context.reporter?.onLog?.(task.id, chunk),
        };
        if (this.runner.runTask) await this.runner.runTask(runnerContext);
        else await this.runner.execute(runnerContext);
        stage = "verification";
        this.boundary(intentName, task.id, stage);
        await this.verify(intentName, task.id, context.hooks, cwd);
        stage = "commit";
        this.boundary(intentName, task.id, stage);
        this.commitResult(intentName, task.id, cwd);
      }
      approved = true;
      context.reporter?.onUpdate(intentName);
      await this.dispatchHooks(this.createHookContext("task.completed", intentName, cwd, task.id), context.hooks);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.stateRepo.load(intentName)?.tasks[task.id]) throw error;
      const failed = this.stateRepo.updateTask(intentName, task.id, record => {
        const now = new Date().toISOString();
        // Notification failure cannot invalidate an already approved, committed result.
        if (!approved) {
          record.status = "failed";
          record.stage = stage;
          record.completedAt = now;
          (record.stages ??= {})[stage] = { ...record.stages?.[stage], status: "failed", completedAt: now };
        }
        if (!record.errors?.includes(message)) (record.errors ??= []).push(message);
        if (!record.diagnostics?.some(entry => entry.message === message && entry.attempt === record.attempt)) {
          (record.diagnostics ??= []).push({ stage, message, recordedAt: now, attempt: record.attempt });
        }
      });
      context.reporter?.onUpdate(intentName);
      if (!approved && cwd) {
        try {
          await this.dispatchHooks(this.createHookContext("task.failed", intentName, cwd, task.id, failed.tasks[task.id].errors), context.hooks);
        } catch (notificationError) {
          this.stateRepo.updateTask(intentName, task.id, record => {
            (record.diagnostics ??= []).push({ stage, message: String(notificationError),
              recordedAt: new Date().toISOString(), attempt: record.attempt });
          });
        }
      }
    } finally {
      this.active.delete(key);
    }
  }
}

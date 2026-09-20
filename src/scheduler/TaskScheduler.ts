import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { AgentRunner, TaskContext } from "../runners/AgentRunner.js";
import { DAGResolver } from "./DAGResolver.js";
import { Task } from "../domain/task.js";
import { IntentExecutionState } from "../domain/execution.js";
import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../application/services/PromptService.js";
import { PATHS } from "../infrastructure/paths.js";
import { SchedulerReporter } from "../application/ports/SchedulerReporter.js";
import { HookDispatcher } from "../application/ports/HookDispatcher.js";
import { HookReporter } from "../application/ports/HookReporter.js";
import { HookContext, HookEvent } from "../domain/hook.js";
import { CodeForgeConfig } from "../config/types.js";

export type SchedulerStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "deadlock";

export type SchedulerRunResult =
  | { status: "completed"; intentName: string }
  | { status: "failed"; intentName: string; reason?: string }
  | { status: "deadlock"; intentName: string };

export class TaskScheduler {
  private status: SchedulerStatus = "idle";

  constructor(
    private gw: WorkspaceGateway,
    private runner: AgentRunner,
    private config: CodeForgeConfig,
    private stateRepo: ExecutionStateRepository,
    private promptService: PromptService,
    private reporter?: SchedulerReporter,
    private hooks?: HookDispatcher,
    private hookReporter?: HookReporter,
  ) {
    if (this.hookReporter && this.hooks?.setReporter) {
      this.hooks.setReporter(this.hookReporter);
    }
  }

  getStatus(): SchedulerStatus {
    return this.status;
  }

  getReporter(): SchedulerReporter | undefined {
    return this.reporter;
  }

  setReporter(reporter?: SchedulerReporter): void {
    this.reporter = reporter;
  }

  getHookDispatcher(): HookDispatcher | undefined {
    return this.hooks;
  }

  setHookDispatcher(hooks?: HookDispatcher): void {
    this.hooks = hooks;
    if (this.hookReporter && this.hooks?.setReporter) {
      this.hooks.setReporter(this.hookReporter);
    }
  }

  getHookReporter(): HookReporter | undefined {
    if (this.hookReporter) {
      return this.hookReporter;
    }
    if (
      this.hooks &&
      "getReporter" in this.hooks &&
      typeof (this.hooks as { getReporter?: unknown }).getReporter === "function"
    ) {
      return (
        this.hooks as { getReporter: () => HookReporter | undefined }
      ).getReporter();
    }
    return undefined;
  }

  setHookReporter(reporter?: HookReporter): void {
    this.hookReporter = reporter;
    if (this.hooks?.setReporter) {
      this.hooks.setReporter(reporter);
    }
  }

  private createResult(
    status: "completed" | "failed" | "deadlock",
    intentName: string,
    reason?: string,
  ): SchedulerRunResult {
    if (status === "failed") {
      return { status, intentName, reason };
    }
    return { status, intentName };
  }

  private createHookContext(
    event: HookEvent,
    intentName: string,
    taskId?: string,
    errors?: string[],
  ): HookContext {
    const ctx: HookContext = {
      event,
      intentName,
      ...(taskId ? { taskId } : {}),
      ...(errors ? { errors } : {}),
    };
    return ctx;
  }

  private loadTasks(intentName: string): Task[] {
    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    if (!this.gw.exists(tasksDir)) {
      return [];
    }
    const files = this.gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
    const tasks: Task[] = [];
    for (const file of files) {
      const content = this.gw.readFile(`${tasksDir}/${file}`);
      tasks.push(JSON.parse(content) as Task);
    }
    return tasks;
  }

  private prepareState(
    intentName: string,
    tasks: Task[],
  ): { ready: true } | { ready: false; result: SchedulerRunResult } {
    let state = this.stateRepo.load(intentName);
    if (!state) {
      state = this.stateRepo.init(intentName, tasks);
      this.stateRepo.save(state);
      return { ready: true };
    }

    if (state.status === "completed") {
      this.status = "completed";
      this.reporter?.onComplete(intentName);
      return { ready: false, result: this.createResult("completed", intentName) };
    }

    const { pending, failed } = this.getTaskCounts(state);
    if (pending === 0 && failed > 0) {
      this.status = "failed";
      const reason = "Intent execution has failed tasks.";
      this.reportFail(intentName, reason);
      return {
        ready: false,
        result: this.createResult("failed", intentName, reason),
      };
    }

    this.status = "running";
    state.status = "running";
    this.stateRepo.save(state);
    return { ready: true };
  }

  private getTaskCounts(state: IntentExecutionState): {
    running: number;
    pending: number;
    failed: number;
  } {
    const tasks = Object.values(state.tasks);
    return {
      running: tasks.filter((t) => t.status === "running").length,
      pending: tasks.filter((t) => t.status === "pending").length,
      failed: tasks.filter((t) => t.status === "failed").length,
    };
  }

  private reportFail(intentName: string, message: string): void {
    if (this.reporter?.onFail) {
      this.reporter.onFail(intentName);
    } else {
      this.reporter?.onError(new Error(message));
    }
  }

  private handleNoReadyTasks(
    intentName: string,
    state: IntentExecutionState,
    counts: { running: number; pending: number; failed: number },
  ): { stop: boolean; event?: HookEvent; result?: SchedulerRunResult } {
    if (counts.running === 0 && counts.pending > 0) {
      this.status = "deadlock";
      state.status = "failed";
      state.completedAt = new Date().toISOString();
      this.stateRepo.save(state);
      this.reporter?.onDeadlock(intentName);
      return {
        stop: true,
        event: "run.deadlock",
        result: this.createResult("deadlock", intentName),
      };
    }

    if (counts.running === 0 && counts.pending === 0) {
      if (counts.failed > 0) {
        this.status = "failed";
        state.status = "failed";
        state.completedAt = new Date().toISOString();
        this.stateRepo.save(state);
        const reason = "One or more tasks failed.";
        this.reportFail(intentName, reason);
        return {
          stop: true,
          event: "run.failed",
          result: this.createResult("failed", intentName, reason),
        };
      }

      this.status = "completed";
      state.status = "completed";
      state.completedAt = new Date().toISOString();
      this.stateRepo.save(state);
      this.reporter?.onComplete(intentName);
      return {
        stop: true,
        event: "run.completed",
        result: this.createResult("completed", intentName),
      };
    }

    return { stop: false };
  }

  /**
   * Runs the gate hooks for a task that the agent just finished.
   *
   * A gate that exits non-zero throws, so the failure path that already exists
   * records the hook output as the task's diagnostics. That is what lets
   * `codeforge task retry` replay them into a fresh prompt.
   *
   * Hooks declared as `notify` are ignored here: they are reported by the
   * dispatcher but never decide whether a task passed.
   */
  private async verify(intentName: string, taskId: string): Promise<void> {
    const results = await this.hooks?.dispatch(
      this.createHookContext("task.verify", intentName, taskId),
    );

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

  private async executeTask(
    intentName: string,
    task: Task,
    model?: string,
  ): Promise<void> {
    const currentState = this.stateRepo.load(intentName);
    const previousErrors = currentState?.tasks[task.id]?.errors;
    if (currentState) {
      currentState.tasks[task.id].status = "running";
      currentState.tasks[task.id].startedAt = new Date().toISOString();
      if (!currentState.startedAt)
        currentState.startedAt = new Date().toISOString();
      this.stateRepo.save(currentState);
      this.reporter?.onUpdate(intentName);
    }

    await this.hooks?.dispatch(
      this.createHookContext("task.started", intentName, task.id),
    );

    const promptPath = this.promptService.createPromptFile(
      intentName,
      task,
      this.config.language,
      previousErrors,
    );

    const context: TaskContext = {
      promptFilePath: promptPath,
      intentName,
      taskId: task.id,
      model,
      silent: true,
      onLog: (chunk: string) => this.reporter?.onLog?.(task.id, chunk),
    };

    try {
      if (this.runner.runTask) {
        await this.runner.runTask(context);
      } else {
        await this.runner.execute(context);
      }

      await this.verify(intentName, task.id);

      const postState = this.stateRepo.load(intentName);
      if (postState) {
        postState.tasks[task.id].status = "completed";
        postState.tasks[task.id].completedAt = new Date().toISOString();
        delete postState.tasks[task.id].errors;
        this.stateRepo.save(postState);
        this.reporter?.onUpdate(intentName);
      }

      await this.hooks?.dispatch(
        this.createHookContext("task.completed", intentName, task.id),
      );
    } catch (error) {
      const errState = this.stateRepo.load(intentName);
      if (errState) {
        errState.tasks[task.id].status = "failed";
        errState.tasks[task.id].completedAt = new Date().toISOString();

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (!errState.tasks[task.id].errors) {
          errState.tasks[task.id].errors = [];
        }
        errState.tasks[task.id].errors!.push(errorMessage);

        this.stateRepo.save(errState);
        this.reporter?.onUpdate(intentName);
      }

      await this.hooks?.dispatch(
        this.createHookContext(
          "task.failed",
          intentName,
          task.id,
          errState?.tasks[task.id].errors,
        ),
      );
    } finally {
      this.promptService.deletePromptFile(promptPath);
    }
  }

  async runAll(intentName: string, model?: string): Promise<SchedulerRunResult> {
    return this.run(intentName, model);
  }

  async run(intentName: string, model?: string): Promise<SchedulerRunResult> {
    const tasks = this.loadTasks(intentName);
    if (tasks.length === 0) {
      this.status = "failed";
      const message = `No tasks found for intent: ${intentName}`;
      this.reporter?.onError(new Error(message));
      return this.createResult("failed", intentName, message);
    }

    const prep = this.prepareState(intentName, tasks);
    if (!prep.ready) {
      this.status = prep.result.status as SchedulerStatus;
      return prep.result;
    }

    this.status = "running";
    const resolver = new DAGResolver();
    this.reporter?.onStart(intentName);
    await this.hooks?.dispatch(
      this.createHookContext("run.started", intentName),
    );

    const activeTasks = new Map<string, Promise<void>>();

    try {
      while (true) {
        const currentState = this.stateRepo.load(intentName);
        if (!currentState) {
          this.status = "failed";
          const reason = `Execution state not found for intent: ${intentName}`;
          return this.createResult("failed", intentName, reason);
        }

        if (currentState.status === "completed") {
          this.status = "completed";
          this.reporter?.onComplete(intentName);
          await this.hooks?.dispatch(
            this.createHookContext("run.completed", intentName),
          );
          return this.createResult("completed", intentName);
        }

        if (currentState.status === "failed") {
          this.status = "failed";
          const reason = "Intent execution failed.";
          this.reportFail(intentName, reason);
          await this.hooks?.dispatch(
            this.createHookContext("run.failed", intentName),
          );
          return this.createResult("failed", intentName, reason);
        }

        const readyTaskIds = resolver.getReadyTasks(currentState);

        for (const taskId of readyTaskIds) {
          if (!activeTasks.has(taskId)) {
            const task = tasks.find((t) => t.id === taskId);
            if (task) {
              const promise = this.executeTask(intentName, task, model).finally(
                () => {
                  activeTasks.delete(taskId);
                },
              );
              activeTasks.set(taskId, promise);
            }
          }
        }

        const counts = this.getTaskCounts(currentState);

        if (activeTasks.size === 0) {
          const outcome = this.handleNoReadyTasks(
            intentName,
            currentState,
            counts,
          );
          if (outcome.stop && outcome.result) {
            this.status = outcome.result.status as SchedulerStatus;
            if (outcome.event) {
              await this.hooks?.dispatch(
                this.createHookContext(outcome.event, intentName),
              );
            }
            return outcome.result;
          }
        }

        await Promise.race(activeTasks.values());
      }
    } catch (error) {
      this.status = "failed";
      const message = error instanceof Error ? error.message : String(error);
      this.reporter?.onError(error instanceof Error ? error : message);
      return this.createResult("failed", intentName, message);
    } finally {
      this.promptService.deletePromptDir(intentName);
    }
  }
}

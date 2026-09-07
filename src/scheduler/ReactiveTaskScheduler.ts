import { EventEmitter } from "node:events";
import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { AgentRunner, TaskContext } from "../runners/AgentRunner.js";
import { DAGResolver } from "./DAGResolver.js";
import { Task } from "../domain/task.js";
import { SpecExecutionState } from "../domain/execution.js";
import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../application/services/PromptService.js";
import { PATHS } from "../infrastructure/paths.js";
import { SchedulerReporter } from "../application/ports/SchedulerReporter.js";
import { HookDispatcher } from "../application/ports/HookDispatcher.js";
import { HookEvent } from "../domain/hook.js";
import { CodeForgeConfig } from "../config/types.js";
import { SchedulerRunResult } from "./TaskScheduler.js";

export type SchedulerStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "deadlock";

export interface RunStartedEvent {
  specName: string;
}

export interface RunCompletedEvent {
  specName: string;
}

export interface RunFailedEvent {
  specName: string;
  reason?: string;
}

export interface RunDeadlockEvent {
  specName: string;
}

export interface TaskStartedEvent {
  specName: string;
  taskId: string;
}

export interface TaskCompletedEvent {
  specName: string;
  taskId: string;
}

export interface TaskFailedEvent {
  specName: string;
  taskId: string;
  errors?: string[];
}

export interface TaskLogEvent {
  specName: string;
  taskId: string;
  chunk: string;
}

export type SchedulerCommand =
  | { type: "RETRY_TASK"; taskId: string }
  | { type: "RETRY_ALL_FAILED" }
  | { type: "COMPLETE_TASK"; taskId: string }
  | { type: "RESET_TASK"; taskId: string };

export interface ReactiveTaskSchedulerDependencies {
  gw: WorkspaceGateway;
  runner: AgentRunner;
  config: CodeForgeConfig;
  stateRepo: ExecutionStateRepository;
  promptService: PromptService;
  reporter?: SchedulerReporter;
  hooks?: HookDispatcher;
}

export class ReactiveTaskScheduler extends EventEmitter {
  private gw: WorkspaceGateway;
  private runner: AgentRunner;
  private config: CodeForgeConfig;
  private stateRepo: ExecutionStateRepository;
  private promptService: PromptService;
  private reporter?: SchedulerReporter;
  private hooks?: HookDispatcher;

  private status: SchedulerStatus = "idle";
  private currentSpecName?: string;
  private currentModel?: string;
  private activeTasks = new Map<string, Promise<void>>();
  private resolver = new DAGResolver();
  private settleResolvers: Array<(result: SchedulerRunResult) => void> = [];

  constructor(
    gwOrOptions: WorkspaceGateway | ReactiveTaskSchedulerDependencies,
    runner?: AgentRunner,
    config?: CodeForgeConfig,
    stateRepo?: ExecutionStateRepository,
    promptService?: PromptService,
    reporter?: SchedulerReporter,
    hooks?: HookDispatcher,
  ) {
    super();

    if ("gw" in gwOrOptions) {
      const opts = gwOrOptions as ReactiveTaskSchedulerDependencies;
      this.gw = opts.gw;
      this.runner = opts.runner;
      this.config = opts.config;
      this.stateRepo = opts.stateRepo;
      this.promptService = opts.promptService;
      this.reporter = opts.reporter;
      this.hooks = opts.hooks;
    } else {
      this.gw = gwOrOptions;
      this.runner = runner!;
      this.config = config!;
      this.stateRepo = stateRepo!;
      this.promptService = promptService!;
      this.reporter = reporter;
      this.hooks = hooks;
    }

    this.on("command:retry", (taskId: string) => {
      void this.retryTask(taskId);
    });
    this.on("command:retry_all", () => {
      void this.retryAllFailed();
    });
    this.on("command:complete", (taskId: string) => {
      void this.completeTask(taskId);
    });
    this.on("command:reset", (taskId: string) => {
      void this.resetTask(taskId);
    });
  }

  getStatus(): SchedulerStatus {
    return this.status;
  }

  getActiveSpec(): string | undefined {
    return this.currentSpecName;
  }

  getState(specName?: string): SpecExecutionState | null {
    const target = specName || this.currentSpecName;
    if (!target) return null;
    return this.stateRepo.load(target);
  }

  getTasks(specName?: string): Task[] {
    const target = specName || this.currentSpecName;
    if (!target) return [];
    return this.loadTasks(target);
  }

  loadTasks(specName: string): Task[] {
    const tasksDir = `${PATHS.tasksDir}/${specName}`;
    if (!this.gw.exists(tasksDir)) {
      return [];
    }
    const files = this.gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
    const tasks: Task[] = [];
    for (const file of files) {
      try {
        const content = this.gw.readFile(`${tasksDir}/${file}`);
        tasks.push(JSON.parse(content) as Task);
      } catch {
        // Ignore unreadable or invalid task files
      }
    }
    return tasks;
  }

  private prepareState(
    specName: string,
    tasks: Task[],
  ): { ready: true } | { ready: false; result: SchedulerRunResult } {
    let state = this.stateRepo.load(specName);
    if (!state) {
      state = this.stateRepo.init(specName, tasks);
      this.stateRepo.save(state);
      return { ready: true };
    }

    if (state.status === "completed") {
      this.reporter?.onComplete(specName);
      return { ready: false, result: { status: "completed", specName } };
    }

    const { pending, failed } = this.getTaskCounts(state);
    if (pending === 0 && failed > 0) {
      const reason = "Spec execution has failed tasks.";
      this.reportFail(specName, reason);
      return {
        ready: false,
        result: {
          status: "failed",
          specName,
          reason,
        },
      };
    }

    state.status = "running";
    this.stateRepo.save(state);
    return { ready: true };
  }

  private getTaskCounts(state: SpecExecutionState): {
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

  private reportFail(specName: string, message: string): void {
    if (this.reporter?.onFail) {
      this.reporter.onFail(specName);
    } else {
      this.reporter?.onError(new Error(message));
    }
  }

  private async verify(specName: string, taskId: string): Promise<void> {
    const results = await this.hooks?.dispatch({
      event: "task.verify",
      specName,
      taskId,
    });

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
    specName: string,
    task: Task,
    model?: string,
  ): Promise<void> {
    const currentState = this.stateRepo.load(specName);
    const previousErrors = currentState?.tasks[task.id]?.errors;
    if (currentState && currentState.tasks[task.id]) {
      currentState.tasks[task.id].status = "running";
      currentState.tasks[task.id].startedAt = new Date().toISOString();
      if (!currentState.startedAt) {
        currentState.startedAt = new Date().toISOString();
      }
      this.stateRepo.save(currentState);
      this.reporter?.onUpdate(specName);
    }

    await this.hooks?.dispatch({ event: "task.started", specName, taskId: task.id });
    this.emit("task:started", { specName, taskId: task.id });

    const promptPath = this.promptService.createPromptFile(
      specName,
      task,
      this.config.language,
      previousErrors,
    );

    const context: TaskContext = {
      promptFilePath: promptPath,
      specName,
      taskId: task.id,
      model,
      silent: true,
      onLog: (chunk: string) => {
        this.emit("task:log", { specName, taskId: task.id, chunk }, task.id, chunk);
      },
    };

    try {
      await this.runner.execute(context);
      await this.verify(specName, task.id);

      const postState = this.stateRepo.load(specName);
      if (postState && postState.tasks[task.id]) {
        postState.tasks[task.id].status = "completed";
        postState.tasks[task.id].completedAt = new Date().toISOString();
        delete postState.tasks[task.id].errors;
        this.stateRepo.save(postState);
        this.reporter?.onUpdate(specName);
      }

      await this.hooks?.dispatch({ event: "task.completed", specName, taskId: task.id });
      this.emit("task:completed", { specName, taskId: task.id });
    } catch (error) {
      const errState = this.stateRepo.load(specName);
      if (errState && errState.tasks[task.id]) {
        if (errState.tasks[task.id].status !== "completed") {
          errState.tasks[task.id].status = "failed";
          errState.tasks[task.id].completedAt = new Date().toISOString();

          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (!errState.tasks[task.id].errors) {
            errState.tasks[task.id].errors = [];
          }
          errState.tasks[task.id].errors!.push(errorMessage);

          this.stateRepo.save(errState);
          this.reporter?.onUpdate(specName);

          await this.hooks?.dispatch({
            event: "task.failed",
            specName,
            taskId: task.id,
            errors: errState.tasks[task.id].errors,
          });
          this.emit("task:failed", {
            specName,
            taskId: task.id,
            errors: errState.tasks[task.id].errors,
          });
        }
      }
    } finally {
      this.promptService.deletePromptFile(promptPath);
    }
  }

  private notifySettled(result: SchedulerRunResult): void {
    const resolvers = [...this.settleResolvers];
    this.settleResolvers = [];
    for (const resolve of resolvers) {
      resolve(result);
    }
  }

  private evaluateRunSettled(specName: string, state: SpecExecutionState): void {
    const counts = this.getTaskCounts(state);

    if (counts.running === 0 && counts.pending > 0) {
      this.status = "deadlock";
      state.status = "failed";
      state.completedAt = new Date().toISOString();
      this.stateRepo.save(state);
      this.reporter?.onDeadlock(specName);
      void this.hooks?.dispatch({ event: "run.deadlock", specName });
      this.emit("run:deadlock", { specName });
      this.notifySettled({ status: "deadlock", specName });
      return;
    }

    if (counts.running === 0 && counts.pending === 0) {
      if (counts.failed > 0) {
        this.status = "failed";
        state.status = "failed";
        state.completedAt = new Date().toISOString();
        this.stateRepo.save(state);
        const reason = "One or more tasks failed.";
        this.reportFail(specName, reason);
        void this.hooks?.dispatch({ event: "run.failed", specName });
        this.emit("run:failed", { specName, reason });
        this.notifySettled({ status: "failed", specName, reason });
        return;
      }

      this.status = "completed";
      state.status = "completed";
      state.completedAt = new Date().toISOString();
      this.stateRepo.save(state);
      this.reporter?.onComplete(specName);
      void this.hooks?.dispatch({ event: "run.completed", specName });
      this.emit("run:completed", { specName });
      this.notifySettled({ status: "completed", specName });
    }
  }

  private async scheduleReadyTasks(): Promise<void> {
    if (!this.currentSpecName) return;
    const specName = this.currentSpecName;

    const currentState = this.stateRepo.load(specName);
    if (!currentState) return;

    const tasks = this.loadTasks(specName);
    const readyTaskIds = this.resolver.getReadyTasks(currentState);

    for (const taskId of readyTaskIds) {
      if (!this.activeTasks.has(taskId)) {
        const task = tasks.find((t) => t.id === taskId);
        if (task) {
          this.status = "running";
          const promise = this.executeTask(specName, task, this.currentModel).finally(
            () => {
              this.activeTasks.delete(taskId);
              this.onTaskFinished();
            },
          );
          this.activeTasks.set(taskId, promise);
        }
      }
    }

    if (this.activeTasks.size === 0) {
      const freshState = this.stateRepo.load(specName) || currentState;
      this.evaluateRunSettled(specName, freshState);
    }
  }

  private onTaskFinished(): void {
    void this.scheduleReadyTasks();
  }

  async run(specName: string, model?: string): Promise<SchedulerRunResult> {
    this.currentSpecName = specName;
    this.currentModel = model;

    const tasks = this.loadTasks(specName);
    if (tasks.length === 0) {
      const message = `No tasks found for spec: ${specName}`;
      this.status = "failed";
      this.reporter?.onError(new Error(message));
      this.emit("run:failed", { specName, reason: message });
      return { status: "failed", specName, reason: message };
    }

    const prep = this.prepareState(specName, tasks);
    if (!prep.ready) {
      this.status = prep.result.status as SchedulerStatus;
      if (prep.result.status === "completed") {
        this.emit("run:completed", { specName });
      } else if (prep.result.status === "failed") {
        this.emit("run:failed", {
          specName,
          reason: (prep.result as { reason?: string }).reason,
        });
      }
      return prep.result;
    }

    this.status = "running";
    this.reporter?.onStart(specName);
    await this.hooks?.dispatch({ event: "run.started" as HookEvent, specName });
    this.emit("run:started", { specName });

    return new Promise<SchedulerRunResult>((resolve) => {
      this.settleResolvers.push(resolve);
      void this.scheduleReadyTasks();
    });
  }

  async startRun(specName: string, model?: string): Promise<SchedulerRunResult> {
    return this.run(specName, model);
  }

  waitForSettled(): Promise<SchedulerRunResult> {
    if (this.status !== "running" && this.activeTasks.size === 0) {
      const finalStatus: "completed" | "failed" | "deadlock" =
        this.status === "deadlock"
          ? "deadlock"
          : this.status === "failed"
            ? "failed"
            : "completed";
      return Promise.resolve({
        status: finalStatus,
        specName: this.currentSpecName || "",
      });
    }

    return new Promise<SchedulerRunResult>((resolve) => {
      this.settleResolvers.push(resolve);
    });
  }

  async retryTask(taskId: string, specName?: string): Promise<void> {
    const targetSpec = specName || this.currentSpecName;
    if (!targetSpec) return;
    this.currentSpecName = targetSpec;

    const state = this.stateRepo.load(targetSpec);
    if (!state || !state.tasks[taskId]) return;

    state.tasks[taskId].status = "pending";
    delete state.tasks[taskId].startedAt;
    delete state.tasks[taskId].completedAt;
    delete state.tasks[taskId].errors;

    if (state.status === "failed" || state.status === "completed") {
      state.status = "running";
      delete state.completedAt;
    }

    this.stateRepo.save(state);
    this.status = "running";
    this.reporter?.onUpdate(targetSpec);

    await this.scheduleReadyTasks();
  }

  async retryAllFailed(specName?: string): Promise<void> {
    const targetSpec = specName || this.currentSpecName;
    if (!targetSpec) return;
    this.currentSpecName = targetSpec;

    const state = this.stateRepo.load(targetSpec);
    if (!state) return;

    const failedTasks = Object.entries(state.tasks).filter(
      ([_, t]) => t.status === "failed",
    );
    if (failedTasks.length === 0) return;

    for (const [_, t] of failedTasks) {
      t.status = "pending";
      delete t.startedAt;
      delete t.completedAt;
      delete t.errors;
    }

    state.status = "running";
    delete state.completedAt;

    this.stateRepo.save(state);
    this.status = "running";
    this.reporter?.onUpdate(targetSpec);

    await this.scheduleReadyTasks();
  }

  async completeTask(taskId: string, specName?: string): Promise<void> {
    const targetSpec = specName || this.currentSpecName;
    if (!targetSpec) return;
    this.currentSpecName = targetSpec;

    const state = this.stateRepo.load(targetSpec);
    if (!state || !state.tasks[taskId]) return;

    state.tasks[taskId].status = "completed";
    state.tasks[taskId].completedAt = new Date().toISOString();
    delete state.tasks[taskId].errors;

    const allCompleted = Object.values(state.tasks).every(
      (t) => t.status === "completed",
    );
    if (allCompleted) {
      state.status = "completed";
      state.completedAt = new Date().toISOString();
    }

    this.stateRepo.save(state);
    this.reporter?.onUpdate(targetSpec);
    this.emit("task:completed", { specName: targetSpec, taskId });
    await this.hooks?.dispatch({
      event: "task.completed",
      specName: targetSpec,
      taskId,
    });

    if (allCompleted) {
      this.status = "completed";
      this.reporter?.onComplete(targetSpec);
      await this.hooks?.dispatch({
        event: "run.completed",
        specName: targetSpec,
      });
      this.emit("run:completed", { specName: targetSpec });
      this.notifySettled({ status: "completed", specName: targetSpec });
    } else {
      await this.scheduleReadyTasks();
    }
  }

  async resetTask(taskId: string, specName?: string): Promise<void> {
    const targetSpec = specName || this.currentSpecName;
    if (!targetSpec) return;
    this.currentSpecName = targetSpec;

    const state = this.stateRepo.load(targetSpec);
    if (!state || !state.tasks[taskId]) return;

    state.tasks[taskId].status = "pending";
    delete state.tasks[taskId].startedAt;
    delete state.tasks[taskId].completedAt;
    delete state.tasks[taskId].errors;

    state.status = "running";
    delete state.completedAt;

    this.stateRepo.save(state);
    this.status = "running";
    this.reporter?.onUpdate(targetSpec);

    await this.scheduleReadyTasks();
  }

  async dispatchCommand(command: SchedulerCommand): Promise<void> {
    switch (command.type) {
      case "RETRY_TASK":
        return this.retryTask(command.taskId);
      case "RETRY_ALL_FAILED":
        return this.retryAllFailed();
      case "COMPLETE_TASK":
        return this.completeTask(command.taskId);
      case "RESET_TASK":
        return this.resetTask(command.taskId);
    }
  }

  override emit(event: "run:started", data: RunStartedEvent): boolean;
  override emit(event: "run:completed", data: RunCompletedEvent): boolean;
  override emit(event: "run:failed", data: RunFailedEvent): boolean;
  override emit(event: "run:deadlock", data: RunDeadlockEvent): boolean;
  override emit(event: "task:started", data: TaskStartedEvent): boolean;
  override emit(event: "task:completed", data: TaskCompletedEvent): boolean;
  override emit(event: "task:failed", data: TaskFailedEvent): boolean;
  override emit(event: "task:log", data: TaskLogEvent, ...extra: unknown[]): boolean;
  override emit(event: "command:retry", taskId: string): boolean;
  override emit(event: "command:retry_all"): boolean;
  override emit(event: "command:complete", taskId: string): boolean;
  override emit(event: "command:reset", taskId: string): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override emit(event: string | symbol, ...args: any[]): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override emit(event: string | symbol, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  override on(event: "run:started", listener: (data: RunStartedEvent) => void): this;
  override on(event: "run:completed", listener: (data: RunCompletedEvent) => void): this;
  override on(event: "run:failed", listener: (data: RunFailedEvent) => void): this;
  override on(event: "run:deadlock", listener: (data: RunDeadlockEvent) => void): this;
  override on(event: "task:started", listener: (data: TaskStartedEvent) => void): this;
  override on(event: "task:completed", listener: (data: TaskCompletedEvent) => void): this;
  override on(event: "task:failed", listener: (data: TaskFailedEvent) => void): this;
  override on(
    event: "task:log",
    listener: (data: TaskLogEvent, ...extra: unknown[]) => void,
  ): this;
  override on(event: "command:retry", listener: (taskId: string) => void): this;
  override on(event: "command:retry_all", listener: () => void): this;
  override on(event: "command:complete", listener: (taskId: string) => void): this;
  override on(event: "command:reset", listener: (taskId: string) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override on(event: string | symbol, listener: (...args: any[]) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

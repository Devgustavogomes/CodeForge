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

export type SchedulerStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "deadlock";

export type SchedulerRunResult =
  | { status: "completed"; specName: string }
  | { status: "failed"; specName: string; reason?: string }
  | { status: "deadlock"; specName: string };

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
  ) {}

  getStatus(): SchedulerStatus {
    return this.status;
  }

  getReporter(): SchedulerReporter | undefined {
    return this.reporter;
  }

  setReporter(reporter?: SchedulerReporter): void {
    this.reporter = reporter;
  }

  private loadTasks(specName: string): Task[] {
    const tasksDir = `${PATHS.tasksDir}/${specName}`;
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
      this.status = "completed";
      this.reporter?.onComplete(specName);
      return { ready: false, result: { status: "completed", specName } };
    }

    const { pending, failed } = this.getTaskCounts(state);
    if (pending === 0 && failed > 0) {
      this.status = "failed";
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

    this.status = "running";
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

  private handleNoReadyTasks(
    specName: string,
    state: SpecExecutionState,
    counts: { running: number; pending: number; failed: number },
  ): { stop: boolean; event?: HookEvent; result?: SchedulerRunResult } {
    if (counts.running === 0 && counts.pending > 0) {
      this.status = "deadlock";
      state.status = "failed";
      state.completedAt = new Date().toISOString();
      this.stateRepo.save(state);
      this.reporter?.onDeadlock(specName);
      return {
        stop: true,
        event: "run.deadlock",
        result: { status: "deadlock", specName },
      };
    }

    if (counts.running === 0 && counts.pending === 0) {
      if (counts.failed > 0) {
        this.status = "failed";
        state.status = "failed";
        state.completedAt = new Date().toISOString();
        this.stateRepo.save(state);
        const reason = "One or more tasks failed.";
        this.reportFail(specName, reason);
        return {
          stop: true,
          event: "run.failed",
          result: {
            status: "failed",
            specName,
            reason,
          },
        };
      }

      this.status = "completed";
      state.status = "completed";
      state.completedAt = new Date().toISOString();
      this.stateRepo.save(state);
      this.reporter?.onComplete(specName);
      return {
        stop: true,
        event: "run.completed",
        result: { status: "completed", specName },
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
    if (currentState) {
      currentState.tasks[task.id].status = "running";
      currentState.tasks[task.id].startedAt = new Date().toISOString();
      if (!currentState.startedAt)
        currentState.startedAt = new Date().toISOString();
      this.stateRepo.save(currentState);
      this.reporter?.onUpdate(specName);
    }

    await this.hooks?.dispatch({ event: "task.started", specName, taskId: task.id });

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
      onLog: (chunk: string) => this.reporter?.onLog?.(task.id, chunk),
    };

    try {
      await this.runner.execute(context);

      await this.verify(specName, task.id);

      const postState = this.stateRepo.load(specName);
      if (postState) {
        postState.tasks[task.id].status = "completed";
        postState.tasks[task.id].completedAt = new Date().toISOString();
        delete postState.tasks[task.id].errors;
        this.stateRepo.save(postState);
        this.reporter?.onUpdate(specName);
      }

      await this.hooks?.dispatch({ event: "task.completed", specName, taskId: task.id });
    } catch (error) {
      const errState = this.stateRepo.load(specName);
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
        this.reporter?.onUpdate(specName);
      }

      await this.hooks?.dispatch({
        event: "task.failed",
        specName,
        taskId: task.id,
        errors: errState?.tasks[task.id].errors,
      });
    } finally {
      this.promptService.deletePromptFile(promptPath);
    }
  }

  async run(specName: string, model?: string): Promise<SchedulerRunResult> {
    const tasks = this.loadTasks(specName);
    if (tasks.length === 0) {
      this.status = "failed";
      const message = `No tasks found for spec: ${specName}`;
      this.reporter?.onError(new Error(message));
      return { status: "failed", specName, reason: message };
    }

    const prep = this.prepareState(specName, tasks);
    if (!prep.ready) {
      this.status = prep.result.status as SchedulerStatus;
      return prep.result;
    }

    this.status = "running";
    const resolver = new DAGResolver();
    this.reporter?.onStart(specName);
    await this.hooks?.dispatch({ event: "run.started", specName });

    const activeTasks = new Map<string, Promise<void>>();

    try {
      while (true) {
        const currentState = this.stateRepo.load(specName);
        if (!currentState) {
          this.status = "failed";
          return {
            status: "failed",
            specName,
            reason: `Execution state not found for spec: ${specName}`,
          };
        }

        if (currentState.status === "completed") {
          this.status = "completed";
          this.reporter?.onComplete(specName);
          await this.hooks?.dispatch({ event: "run.completed", specName });
          return { status: "completed", specName };
        }

        if (currentState.status === "failed") {
          this.status = "failed";
          const reason = "Spec execution failed.";
          this.reportFail(specName, reason);
          await this.hooks?.dispatch({ event: "run.failed", specName });
          return { status: "failed", specName, reason };
        }

        const readyTaskIds = resolver.getReadyTasks(currentState);

        for (const taskId of readyTaskIds) {
          if (!activeTasks.has(taskId)) {
            const task = tasks.find((t) => t.id === taskId);
            if (task) {
              const promise = this.executeTask(specName, task, model).finally(
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
            specName,
            currentState,
            counts,
          );
          if (outcome.stop && outcome.result) {
            this.status = outcome.result.status as SchedulerStatus;
            if (outcome.event) {
              await this.hooks?.dispatch({ event: outcome.event, specName });
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
      return { status: "failed", specName, reason: message };
    } finally {
      this.promptService.deletePromptDir(specName);
    }
  }
}

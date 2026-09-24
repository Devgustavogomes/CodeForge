import { AgentRunner, TaskContext } from "../runners/AgentRunner.js";
import { CodeForgeConfig } from "../config/types.js";
import { ExecutionStateRepository } from "../infrastructure/repositories/ExecutionStateRepository.js";
import { PromptService } from "../application/services/PromptService.js";
import { Task } from "../domain/task.js";
import { HookContext, HookEvent } from "../domain/hook.js";
import { TaskExecutionContext } from "./types.js";
import { HookDispatcher } from "../application/ports/HookDispatcher.js";

export class TaskExecutor {
  constructor(
    private runner: AgentRunner,
    private config: CodeForgeConfig,
    private stateRepo: ExecutionStateRepository,
    private promptService: PromptService,
  ) {}

  private createHookContext(
    event: HookEvent,
    intentName: string,
    taskId?: string,
    errors?: string[],
  ): HookContext {
    return {
      event,
      intentName,
      ...(taskId ? { taskId } : {}),
      ...(errors ? { errors } : {}),
    };
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
  async verify(intentName: string, taskId: string, hooks?: HookDispatcher): Promise<void> {
    const results = await hooks?.dispatch(
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

  async executeTask(
    intentName: string,
    task: Task,
    context: TaskExecutionContext,
  ): Promise<void> {
    const currentState = this.stateRepo.load(intentName);
    const previousErrors = currentState?.tasks[task.id]?.errors;
    if (currentState) {
      currentState.tasks[task.id].status = "running";
      currentState.tasks[task.id].startedAt = new Date().toISOString();
      if (!currentState.startedAt) {
        currentState.startedAt = new Date().toISOString();
      }
      this.stateRepo.save(currentState);
      context.reporter?.onUpdate(intentName);
    }

    await context.hooks?.dispatch(
      this.createHookContext("task.started", intentName, task.id),
    );

    const promptPath = this.promptService.createPromptFile(
      intentName,
      task,
      this.config.language,
      previousErrors,
    );

    const runnerContext: TaskContext = {
      promptFilePath: promptPath,
      intentName,
      taskId: task.id,
      model: context.model,
      silent: true,
      onLog: (chunk: string) => context.reporter?.onLog?.(task.id, chunk),
    };

    try {
      if (this.runner.runTask) {
        await this.runner.runTask(runnerContext);
      } else {
        await this.runner.execute(runnerContext);
      }

      await this.verify(intentName, task.id, context.hooks);

      const postState = this.stateRepo.load(intentName);
      if (postState) {
        postState.tasks[task.id].status = "completed";
        postState.tasks[task.id].completedAt = new Date().toISOString();
        delete postState.tasks[task.id].errors;
        this.stateRepo.save(postState);
        context.reporter?.onUpdate(intentName);
      }

      await context.hooks?.dispatch(
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
        context.reporter?.onUpdate(intentName);
      }

      await context.hooks?.dispatch(
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
}

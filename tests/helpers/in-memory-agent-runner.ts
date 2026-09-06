import { AgentRunner, TaskContext } from "../../src/runners/AgentRunner.js";

export type AgentExecutionHandler = (context: TaskContext) => Promise<void> | void;

export class InMemoryAgentRunner implements AgentRunner {
  public executedContexts: TaskContext[] = [];
  private generalError: Error | null = null;
  private taskErrors: Map<string, Error> = new Map();
  private customHandler?: AgentExecutionHandler;
  private availableAgents: string[] = ["antigravity", "cursor", "claude", "codex"];
  private delayMs: number = 0;

  constructor(options?: {
    availableAgents?: string[];
    handler?: AgentExecutionHandler;
  }) {
    if (options?.availableAgents) {
      this.availableAgents = [...options.availableAgents];
    }
    if (options?.handler) {
      this.customHandler = options.handler;
    }
  }

  async execute(context: TaskContext): Promise<void> {
    this.executedContexts.push({ ...context });

    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (context.taskId && this.taskErrors.has(context.taskId)) {
      throw this.taskErrors.get(context.taskId)!;
    }

    if (this.generalError) {
      throw this.generalError;
    }

    if (this.customHandler) {
      await this.customHandler(context);
    }
  }

  async getAvailableAgents(): Promise<string[]> {
    return [...this.availableAgents];
  }

  withAvailableAgents(agents: string[]): this {
    this.availableAgents = [...agents];
    return this;
  }

  withSuccess(): this {
    this.generalError = null;
    this.taskErrors.clear();
    return this;
  }

  withError(error: Error | string): this {
    this.generalError = typeof error === "string" ? new Error(error) : error;
    return this;
  }

  withErrorForTask(taskId: string, error?: Error | string): this {
    const err =
      typeof error === "string"
        ? new Error(error)
        : (error ?? new Error(`Execution failed for task ${taskId}`));
    this.taskErrors.set(taskId, err);
    return this;
  }

  withHandler(handler: AgentExecutionHandler): this {
    this.customHandler = handler;
    return this;
  }

  withDelay(ms: number): this {
    this.delayMs = ms;
    return this;
  }

  hasExecuted(taskId: string): boolean {
    return this.executedContexts.some((c) => c.taskId === taskId);
  }

  reset(): void {
    this.executedContexts = [];
    this.generalError = null;
    this.taskErrors.clear();
    this.customHandler = undefined;
    this.delayMs = 0;
  }
}

import { Task } from "../../src/domain/task.js";
import { IntentExecutionState, TaskStatus } from "../../src/domain/execution.js";

export class TaskBuilder {
  private id: string = "TASK-001";
  private title: string = "Default Title";
  private objective: string = "Default Objective";
  private context: string = "Default Context";
  private implementation: string = "Default Implementation";
  private files: string[] = [];
  private dependencies: string[] = [];
  private constraints: string[] = [];
  private acceptanceCriteria: string[] = [];

  constructor(defaults?: Partial<Task>) {
    if (defaults) {
      if (defaults.id !== undefined) this.id = defaults.id;
      if (defaults.title !== undefined) this.title = defaults.title;
      if (defaults.objective !== undefined) this.objective = defaults.objective;
      if (defaults.context !== undefined) this.context = defaults.context;
      if (defaults.implementation !== undefined) this.implementation = defaults.implementation;
      if (defaults.files !== undefined) this.files = [...defaults.files];
      if (defaults.dependencies !== undefined) this.dependencies = [...defaults.dependencies];
      if (defaults.constraints !== undefined) this.constraints = [...defaults.constraints];
      if (defaults.acceptanceCriteria !== undefined) this.acceptanceCriteria = [...defaults.acceptanceCriteria];
    }
  }

  static aTask(defaults?: Partial<Task>): TaskBuilder {
    return new TaskBuilder(defaults);
  }

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTitle(title: string): this {
    this.title = title;
    return this;
  }

  withObjective(objective: string): this {
    this.objective = objective;
    return this;
  }

  withContext(context: string): this {
    this.context = context;
    return this;
  }

  withImplementation(implementation: string): this {
    this.implementation = implementation;
    return this;
  }

  withFiles(files: string[]): this {
    this.files = [...files];
    return this;
  }

  withDependencies(deps: string[]): this {
    this.dependencies = [...deps];
    return this;
  }

  withConstraints(constraints: string[]): this {
    this.constraints = [...constraints];
    return this;
  }

  withAcceptanceCriteria(criteria: string[]): this {
    this.acceptanceCriteria = [...criteria];
    return this;
  }

  build(): Task {
    return {
      id: this.id,
      title: this.title,
      objective: this.objective,
      context: this.context,
      implementation: this.implementation,
      files: [...this.files],
      dependencies: [...this.dependencies],
      constraints: [...this.constraints],
      acceptanceCriteria: [...this.acceptanceCriteria],
    };
  }

  static anIntentExecutionState(
    intentId: string = "test-intent",
    tasks: Record<string, { status: TaskStatus; dependencies?: string[]; title?: string }> = {},
    status: TaskStatus = "pending",
  ): IntentExecutionState {
    const taskStates: Record<string, { status: TaskStatus; dependencies: string[]; title?: string }> = {};
    for (const [id, t] of Object.entries(tasks)) {
      taskStates[id] = {
        status: t.status,
        dependencies: t.dependencies ?? [],
        title: t.title,
      };
    }
    const state: IntentExecutionState = {
      intentId,
      status,
      tasks: taskStates,
      updatedAt: new Date().toISOString(),
    };
    (state as any).intentId = intentId;
    return state;
  }

  toExecutionState(intentId: string = "test-intent", status: TaskStatus = "pending"): IntentExecutionState {
    const state: IntentExecutionState = {
      intentId,
      status,
      tasks: {
        [this.id]: {
          status,
          dependencies: [...this.dependencies],
          title: this.title,
        },
      },
      updatedAt: new Date().toISOString(),
    };
    (state as any).intentId = intentId;
    return state;
  }
}

export class IntentExecutionStateBuilder {
  private intentId: string = "test-intent";
  private status: TaskStatus = "pending";
  private tasks: Record<string, { status: TaskStatus; dependencies: string[]; title?: string }> = {};
  private startedAt?: string;
  private completedAt?: string;
  private updatedAt: string = new Date().toISOString();

  static anExecutionState(defaults?: Partial<IntentExecutionState>): IntentExecutionStateBuilder {
    const builder = new IntentExecutionStateBuilder();
    if (defaults) {
      if (defaults.intentId !== undefined) builder.intentId = defaults.intentId;
      if (defaults.status !== undefined) builder.status = defaults.status;
      if (defaults.tasks !== undefined) builder.tasks = { ...defaults.tasks };
      if (defaults.startedAt !== undefined) builder.startedAt = defaults.startedAt;
      if (defaults.completedAt !== undefined) builder.completedAt = defaults.completedAt;
      if (defaults.updatedAt !== undefined) builder.updatedAt = defaults.updatedAt;
    }
    return builder;
  }

  withIntentId(intentId: string): this {
    this.intentId = intentId;
    return this;
  }

  withStatus(status: TaskStatus): this {
    this.status = status;
    return this;
  }

  withTask(taskId: string, status: TaskStatus = "pending", dependencies: string[] = []): this {
    this.tasks[taskId] = { status, dependencies };
    return this;
  }

  build(): IntentExecutionState {
    const state: IntentExecutionState = {
      intentId: this.intentId,
      status: this.status,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      tasks: { ...this.tasks },
      updatedAt: this.updatedAt,
    };
    (state as any).intentId = this.intentId;
    return state;
  }
}

import { Task } from "../../src/domain/task.js";

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
}

import type { Task } from "./task.js";

/** Orchestration artifacts stay central; source inspection and edits use executionRoot. */
export interface ExecutionRoots {
  orchestrationRoot: string;
  executionRoot: string;
}

export interface ExecutionContext {
  roots?: ExecutionRoots;
  task: Task;

  intentContext: string;

  repository: RepositoryContext;

  factoryRules: string[];

  availableContext: AvailableContext;
}

export interface RepositoryContext {
  path: string;
  commit: string;
}

export interface AvailableContext {
  documentation: string[];
  files: string[];
  architecture: string[];
  previousResults: string[];
}

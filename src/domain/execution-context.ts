import type { Task } from "./task.js";

export interface ExecutionContext {
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

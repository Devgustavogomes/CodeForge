import { SpecExecutionState, TaskStatus } from "../../domain/execution.js";
import { Task } from "../../domain/task.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";

export interface TaskStatusInfo {
  id: string;
  title: string;
  status: TaskStatus;
  dependencies: string[];
  startedAt?: string;
  completedAt?: string;
  errors?: string[];
}

export type StatusResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "no-execution"; specName: string }
  | { kind: "status"; specName: string; specStatus: string; tasks: TaskStatusInfo[]; updatedAt: string; startedAt?: string; completedAt?: string };

export class GetSpecStatusUseCase {
  constructor(private readonly gw: WorkspaceGateway) {}

  execute(specName: string): StatusResult {
    if (!this.gw.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const tasksDir = `${PATHS.tasksDir}/${specName}`;
    if (!this.gw.exists(tasksDir)) {
      return { kind: "spec-not-found" };
    }

    const statePath = PATHS.executionState(specName);
    if (!this.gw.exists(statePath)) {
      return { kind: "no-execution", specName };
    }

    const state = JSON.parse(
      this.gw.readFile(statePath),
    ) as SpecExecutionState;

    const tasks: TaskStatusInfo[] = [];

    const taskFiles = this.gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
    for (const file of taskFiles) {
      const taskId = file.replace(".json", "");
      const taskPath = `${tasksDir}/${file}`;
      const taskDef = JSON.parse(this.gw.readFile(taskPath)) as Task;

      const taskState = state.tasks[taskId];
      tasks.push({
        id: taskId,
        title: taskDef.title,
        status: taskState?.status ?? "pending",
        dependencies: taskDef.dependencies || [],
        startedAt: taskState?.startedAt,
        completedAt: taskState?.completedAt,
        errors: taskState?.errors,
      });
    }

    // Sort by task ID for consistent ordering
    tasks.sort((a, b) => a.id.localeCompare(b.id));

    return {
      kind: "status",
      specName,
      specStatus: state.status,
      tasks,
      updatedAt: state.updatedAt,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
    };
  }
}

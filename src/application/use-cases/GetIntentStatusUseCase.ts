import { IntentExecutionState, TaskStatus } from "../../domain/execution.js";
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

export type IntentStatusResult =
  | { kind: "not-initialized" }
  | { kind: "intent-not-found" }
  | { kind: "no-execution"; intentName: string }
  | {
      kind: "status";
      intentName: string;
      intentStatus: string;
      tasks: TaskStatusInfo[];
      updatedAt: string;
      startedAt?: string;
      completedAt?: string;
    };

export class GetIntentStatusUseCase {
  constructor(private readonly gw: WorkspaceGateway) {}

  execute(intentName: string): IntentStatusResult {
    if (!this.gw.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    if (!this.gw.exists(tasksDir)) {
      return { kind: "intent-not-found" };
    }

    const statePath = PATHS.executionState(intentName);
    if (!this.gw.exists(statePath)) {
      return { kind: "no-execution", intentName };
    }

    const state = JSON.parse(
      this.gw.readFile(statePath),
    ) as IntentExecutionState;

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
      intentName,
      intentStatus: state.status,
      tasks,
      updatedAt: state.updatedAt,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
    };
  }
}

import { IntentExecutionState, TaskExecutionState, isTaskIntegrated, TaskStatus } from "../../domain/execution.js";
import { Task } from "../../domain/task.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";
import { ExecutionStateRepository } from "../../infrastructure/repositories/ExecutionStateRepository.js";

export interface TaskStatusInfo extends Partial<TaskExecutionState> {
  integrated?: boolean;
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
      execution?: IntentExecutionState;
      delivered?: boolean;
      updatedAt: string;
      startedAt?: string;
      completedAt?: string;
    };

export class GetIntentStatusUseCase {
  private readonly stateRepo: ExecutionStateRepository;

  constructor(
    private readonly gw: WorkspaceGateway,
    stateRepo?: ExecutionStateRepository,
  ) {
    this.stateRepo = stateRepo ?? new ExecutionStateRepository(gw);
  }

  execute(intentName: string): IntentStatusResult {
    if (!this.gw.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    if (!this.gw.exists(tasksDir)) {
      return { kind: "intent-not-found" };
    }

    const state = this.stateRepo.load(intentName);
    if (!state) {
      return { kind: "no-execution", intentName };
    }

    const tasks: TaskStatusInfo[] = [];

    const taskFiles = this.gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
    for (const file of taskFiles) {
      const taskId = file.replace(".json", "");
      const taskPath = `${tasksDir}/${file}`;
      const taskDef = JSON.parse(this.gw.readFile(taskPath)) as Task;

      const taskState = state.tasks[taskId];
      tasks.push({
        ...taskState,
        integrated: isTaskIntegrated(state, taskId),
        id: taskId,
        title: taskDef.title,
        status: taskState?.status ?? "pending",
        dependencies: taskDef.dependencies || [],
        startedAt: taskState?.startedAt,
        completedAt: taskState?.completedAt,
        errors: taskState?.errors,
      });
    }

    for (const [id, task] of Object.entries(state.tasks)) {
      if (!tasks.some(item => item.id === id)) {
        tasks.push({ ...task, id, title: task.title ?? id, integrated: isTaskIntegrated(state, id) });
      }
    }

    // Sort by task ID for consistent ordering
    tasks.sort((a, b) => a.id.localeCompare(b.id));

    return {
      kind: "status",
      intentName,
      intentStatus: state.status,
      tasks,
      execution: state,
      delivered: isRunDelivered(state) && tasks.every(task => task.integrated),
      updatedAt: state.updatedAt,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
    };
  }
}

/** Full success requires the current accepted result to have been delivered. */
export function isRunDelivered(state: IntentExecutionState): boolean {
  return state.status !== "failed" && !state.reviewError && !!state.lastAcceptedCommit && state.delivery?.status === "succeeded" &&
    state.delivery.deliveredCommit === state.lastAcceptedCommit &&
    Object.keys(state.tasks).length > 0 && Object.keys(state.tasks).every(id => isTaskIntegrated(state, id)) &&
    !state.integrationQueue?.length && !state.operations?.some(op => op.kind !== "cleanup" && op.status === "intended");
}

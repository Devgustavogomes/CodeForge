import { IntentExecutionState } from "../../domain/execution.js";
import { Task } from "../../domain/task.js";
import { WorkspaceGateway } from "../workspace.js";
import { PATHS } from "../paths.js";

export class ExecutionStateRepository {
  constructor(private gw: WorkspaceGateway) {}

  load(intentName: string): IntentExecutionState | null {
    const statePath = PATHS.executionState(intentName);
    if (this.gw.exists(statePath)) {
      const state = JSON.parse(this.gw.readFile(statePath)) as IntentExecutionState;
      return state;
    }
    return null;
  }

  save(state: IntentExecutionState): void {
    const intentId = state.intentId;
    const statePath = PATHS.executionState(intentId);
    state.updatedAt = new Date().toISOString();
    this.gw.writeFile(statePath, JSON.stringify(state, null, 2));
  }

  init(intentName: string, tasks: Task[]): IntentExecutionState {
    const state: IntentExecutionState = {
      intentId: intentName,
      status: "running",
      startedAt: new Date().toISOString(),
      tasks: {},
      updatedAt: new Date().toISOString(),
    };

    for (const task of tasks) {
      state.tasks[task.id] = {
        status: "pending",
        dependencies: task.dependencies || [],
        title: task.title,
      };
    }
    return state;
  }
}

import { SpecExecutionState } from "../../domain/execution.js";
import { Task } from "../../domain/task.js";
import { WorkspaceGateway } from "../workspace.js";
import { PATHS } from "../paths.js";

export class ExecutionStateRepository {
  constructor(private gw: WorkspaceGateway) {}

  load(specName: string): SpecExecutionState | null {
    const statePath = PATHS.executionState(specName);
    if (this.gw.exists(statePath)) {
      return JSON.parse(this.gw.readFile(statePath)) as SpecExecutionState;
    }
    return null;
  }

  save(state: SpecExecutionState): void {
    const statePath = PATHS.executionState(state.specId);
    state.updatedAt = new Date().toISOString();
    this.gw.writeFile(statePath, JSON.stringify(state, null, 2));
  }

  init(specName: string, tasks: Task[]): SpecExecutionState {
    const state: SpecExecutionState = {
      specId: specName,
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

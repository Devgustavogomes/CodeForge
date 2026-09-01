import { SpecExecutionState } from "../domain/execution.js";
import { Task } from "../domain/task.js";
import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { PATHS } from "../infrastructure/paths.js";

export function loadExecutionState(
  gw: WorkspaceGateway,
  specName: string,
): SpecExecutionState | null {
  const statePath = PATHS.executionState(specName);
  if (gw.exists(statePath)) {
    return JSON.parse(gw.readFile(statePath)) as SpecExecutionState;
  }
  return null;
}

export function saveExecutionState(gw: WorkspaceGateway, state: SpecExecutionState): void {
  const statePath = PATHS.executionState(state.specId);
  state.updatedAt = new Date().toISOString();
  gw.writeFile(statePath, JSON.stringify(state, null, 2));
}

export function initExecutionState(
  specName: string,
  tasks: Task[],
): SpecExecutionState {
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

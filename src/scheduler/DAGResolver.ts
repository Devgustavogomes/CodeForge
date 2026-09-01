import { SpecExecutionState } from "../domain/execution.js";

export class DAGResolver {
  getReadyTasks(state: SpecExecutionState): string[] {
    const readyTasks: string[] = [];
    
    for (const [taskId, taskState] of Object.entries(state.tasks)) {
      if (taskState.status !== "pending") {
        continue;
      }

      const dependencies = taskState.dependencies || [];
      const allDepsCompleted = dependencies.every((dep) => {
        const depState = state.tasks[dep];
        return depState && depState.status === "completed";
      });

      if (allDepsCompleted) {
        readyTasks.push(taskId);
      }
    }
    
    return readyTasks;
  }
}

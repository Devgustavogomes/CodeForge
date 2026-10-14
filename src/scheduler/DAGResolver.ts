import { IntentExecutionState, isTaskIntegrated } from "../domain/execution.js";

export class DAGResolver {
  getReadyTasks(state: IntentExecutionState): string[] {
    const readyTasks: string[] = [];

    for (const [taskId, taskState] of Object.entries(state.tasks)) {
      if (taskState.status !== "pending") {
        continue;
      }

      const dependencies = taskState.dependencies || [];
      const allDepsIntegrated = dependencies.every((dep) => {
        return isTaskIntegrated(state, dep);
      });

      if (allDepsIntegrated) {
        readyTasks.push(taskId);
      }
    }

    return readyTasks;
  }
}

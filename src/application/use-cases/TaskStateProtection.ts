import { IntentExecutionState, TaskExecutionState } from "../../domain/execution.js";

export type ProtectedOperationResult = { kind: "blocked"; message: string };

export function hasRecoveryEvidence(task: TaskExecutionState): boolean {
  return !!(task.branch || task.worktreePath || task.baseCommit || task.resultCommit ||
    task.owner || task.cleanup || task.integration?.acceptedCommit || task.integration?.resultCommit ||
    task.stage || Object.keys(task.stages ?? {}).length || task.diagnostics?.length);
}

/** State changes must preserve both the result and the plan that consumed it. */
export function taskMutationBlock(state: IntentExecutionState, taskId: string): ProtectedOperationResult | undefined {
  const task = state.tasks[taskId];
  const consumer = Object.entries(state.tasks).find(([id, item]) => id !== taskId &&
    item.dependencies.includes(taskId) && (item.baseCommit || item.startedAt || item.status !== "pending"));
  if (consumer) return { kind: "blocked", message: "Task " + taskId + " is consumed by " + consumer[0] +
    ". Preserve the dependency and its integrated result; create a follow-up task instead." };
  if (task && (hasRecoveryEvidence(task) || task.status === "running") || state.owner || state.integrationOwner ||
      state.operations?.some(item => item.taskId === taskId) || state.processes?.some(item => item.taskId === taskId) ||
      state.integrationQueue?.includes(taskId)) {
    return { kind: "blocked", message: "Task " + taskId + " has execution or Git recovery evidence. " +
      "Resume or retry the existing run; reset/deletion would invalidate that evidence. No artifacts were changed." };
  }
  return undefined;
}

export function intentMutationBlock(state: IntentExecutionState): ProtectedOperationResult | undefined {
  if (state.repositoryPath || state.originalCommit || state.originalBranch || state.originalWorktreePath ||
      state.integrationBranch || state.integrationWorktreePath || state.lastAcceptedCommit || state.owner ||
      state.integrationOwner || state.operations?.length || state.processes?.length ||
      state.integrationQueue?.length || state.cleanup?.length || Object.keys(state.archivedTasks ?? {}).length ||
      state.delivery?.resultCommit || state.delivery?.deliveredCommit ||
      Object.values(state.tasks).some(task => hasRecoveryEvidence(task) || task.status === "running")) {
    return { kind: "blocked", message: "This intent contains execution or Git recovery evidence. " +
      "Resume the existing run or keep it for recovery; deletion cannot erase branches, commits, ownership, or consumed results." };
  }
  return undefined;
}

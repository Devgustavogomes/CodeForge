import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";

/** Explicit Git evidence fixture: completion alone must never release a dependency. */
export function recordIntegration(repo: ExecutionStateRepository, intentName: string, taskId: string): void {
  repo.updateTask(intentName, taskId, (task, state) => {
    state.repositoryPath = "/fixture/repository";
    state.originalWorktreePath = state.repositoryPath;
    state.originalBranch = "main";
    state.originalCommit = "fixture-base";
    state.integrationBranch = "codex/fixture-integration";
    state.integrationWorktreePath = "/fixture/integration";
    state.lastAcceptedCommit = "accepted-" + taskId;
    task.branch = "codex/fixture-" + taskId;
    task.worktreePath = "/fixture/" + taskId;
    task.baseCommit = "base-" + taskId;
    task.resultCommit = "result-" + taskId;
    task.integration = { status: "succeeded", resultCommit: task.resultCommit,
      acceptedCommit: state.lastAcceptedCommit };
  });
}

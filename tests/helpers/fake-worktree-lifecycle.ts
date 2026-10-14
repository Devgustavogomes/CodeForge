import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import path from "node:path";
import { IntegrationGit, TaskResultGit, TaskSchedulerDependencies } from "../../src/scheduler/types.js";

/** Scheduler unit tests exercise orchestration; lifecycle tests use real Git repositories. */
export function fakeWorktreeLifecycle(
  repository: ExecutionStateRepository,
  cwd = process.cwd(),
): NonNullable<TaskSchedulerDependencies["worktreeLifecycle"]> {
  const owned = { directory: path.resolve(cwd, "isolated-task"), branch: "codex/test", baseCommit: "a".repeat(40) };
  const prepare = (intentName: string) => repository.update(intentName, state => {
    state.repositoryPath ??= cwd;
    state.originalWorktreePath ??= cwd;
    state.originalBranch ??= "main";
    state.originalCommit ??= owned.baseCommit;
    state.integrationBranch ??= owned.branch;
    state.integrationWorktreePath ??= path.resolve(cwd, "integration");
    state.lastAcceptedCommit ??= owned.baseCommit;
  });
  return {
    async initializeRun(intentName, tasks) {
      if (!repository.load(intentName)) repository.save(repository.init(intentName, tasks));
      prepare(intentName);
      return repository.load(intentName)!;
    },
    async prepareIntegration(intentName) { prepare(intentName); return owned; },
    getIntegrationCommit() { return owned.baseCommit; },
    async prepareTask(intentName, taskId) {
      repository.updateTask(intentName, taskId, (task, state) => {
        state.repositoryPath ??= cwd;
        state.originalWorktreePath ??= cwd;
        task.branch = owned.branch;
        task.worktreePath = owned.directory;
        task.baseCommit = owned.baseCommit;
        (task.stages ??= {}).preparation = { status: "succeeded" };
      });
      return owned;
    },
  };
}

export function fakeTaskResultGit(): TaskResultGit & IntegrationGit {
  return {
    getRepositoryInfo: directory => ({ directory, gitDirectory: directory, commonDirectory: directory,
      branch: "codex/test", head: "a".repeat(40) }),
    integrate: () => ({ status: "integrated", head: "a".repeat(40), conflicts: [], diagnostics: "Merged" }),
    getStatus: () => [], stageAll: () => {}, commit: () => "a".repeat(40),
    getCommitMessage: () => "", isAncestor: () => true,
  };
}

/** Delivery fixture tracks the expected checkout update, independently of task commits. */
export function fakeDeliveryGit(repository: ExecutionStateRepository, intentName: string): import("../../src/scheduler/DeliveryCoordinator.js").DeliveryGit {
  let delivered: string | undefined;
  return {
    getRepositoryInfo(directory) {
      const state = repository.load(intentName)!;
      const integration = directory === state.integrationWorktreePath;
      return { directory, gitDirectory: state.repositoryPath!, commonDirectory: state.repositoryPath!,
        branch: integration ? state.integrationBranch! : state.originalBranch!,
        head: integration ? state.lastAcceptedCommit! : delivered ?? state.originalCommit! };
    },
    getStatus: () => [], isAncestor: () => true,
    updateOriginalBranch(_directory, _branch, _expected, result) { delivered = result; return true; },
  };
}

/** Recovery unit fixtures inspect their persisted synthetic Git identities. */
export function fakeRecoveryCoordinator(repository: ExecutionStateRepository): NonNullable<TaskSchedulerDependencies["recoveryCoordinator"]> {
  return { async reconcile(intentName) {
    const { ExecutionRecoveryCoordinator } = await import("../../src/scheduler/ExecutionRecoveryCoordinator.js");
    const { FakeProcessExecutor } = await import("./fake-process-executor.js");
    const info = (directory: string) => {
      const state = repository.load(intentName)!;
      const task = Object.values(state.tasks).find(item => item.worktreePath && path.resolve(item.worktreePath) === path.resolve(directory));
      const integration = state.integrationWorktreePath && path.resolve(directory) === path.resolve(state.integrationWorktreePath);
      return { directory, gitDirectory: directory, commonDirectory: state.repositoryPath!,
        branch: integration ? state.integrationBranch! : task?.branch ?? state.originalBranch!,
        head: integration ? state.lastAcceptedCommit! : task?.resultCommit ?? task?.baseCommit ?? state.originalCommit! };
    };
    const git = { getRepositoryInfo: info, getStatus: () => [], getConflicts: () => [], getCommitMessage: () => "", isAncestor: () => true,
      listWorktrees: () => {
        const state = repository.load(intentName)!;
        return [state.originalWorktreePath, state.integrationWorktreePath, ...Object.values(state.tasks).map(task => task.worktreePath)]
          .filter((directory): directory is string => !!directory).map(directory => ({ ...info(directory),
            head: info(directory).head, locked: false, prunable: false }));
      } };
    return new ExecutionRecoveryCoordinator(repository, git, new FakeProcessExecutor()).reconcile(intentName);
  } };
}

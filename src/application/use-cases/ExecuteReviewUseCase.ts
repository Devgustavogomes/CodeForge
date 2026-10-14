import { CodeForgeConfig } from "../../config/types.js";
import { Task } from "../../domain/task.js";
import { GitGateway } from "../../infrastructure/git/GitGateway.js";
import { PATHS } from "../../infrastructure/paths.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { AgentRunner } from "../../runners/AgentRunner.js";
import { PromptService } from "../services/PromptService.js";
import { formatGitDiffSummary, GitDiffRange } from "../services/diff-formatter.js";

export interface ExecuteReviewInput {
  cwd?: string;
  accumulatedResult?: GitDiffRange;
  intentName: string;
  completedTasks: Task[];
  onLog?: (chunk: string) => void;
}

export interface ExecuteReviewResult {
  newTaskIds: string[];
  newTaskFiles: string[];
}

export class ExecuteReviewUseCase {
  private readonly workspace: WorkspaceGateway;

  constructor(
    workspace: WorkspaceGateway,
    private readonly git: GitGateway,
    private readonly runner: AgentRunner,
    private readonly promptService: PromptService,
    private readonly config: CodeForgeConfig,
    private readonly cwd: string = process.cwd(),
  ) {
    this.workspace = workspace.executionWorkspace();
  }

  async execute({ intentName, completedTasks, onLog, accumulatedResult, cwd = accumulatedResult?.directory ?? this.cwd }: ExecuteReviewInput): Promise<ExecuteReviewResult> {
    const taskDirectory = `${PATHS.tasksDir}/${intentName}`;
    if (!this.workspace.exists(taskDirectory)) {
      this.workspace.mkdir(taskDirectory);
    }

    const before = this.listTaskFiles(taskDirectory);
    const promptPath = this.promptService.createReviewPromptFile(
      intentName,
      completedTasks,
      formatGitDiffSummary(this.git, undefined, accumulatedResult),
      before,
      this.config.language,
      { orchestrationRoot: this.cwd, executionRoot: cwd },
      accumulatedResult,
    );

    await this.runner.execute({
      cwd,
      promptFilePath: promptPath,
      intentName,
      model: this.config.aiReview?.agent ?? "default",
      silent: true,
      quietTerminal: true,
      onLog,
    });

    const newTaskFiles = this.listTaskFiles(taskDirectory)
      .filter((file) => !before.includes(file));
    this.promptService.deletePromptFile(promptPath);
    return {
      newTaskFiles,
      newTaskIds: newTaskFiles.map((file) => file.slice(0, -".json".length)),
    };
  }

  private listTaskFiles(taskDirectory: string): string[] {
    return this.workspace.listDir(taskDirectory)
      // The plan validator examines every JSON file in this directory. Discover
      // the same set so malformed or wrongly named reviewer output cannot be
      // interpreted as an approval.
      .filter((file) => file.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  }

}

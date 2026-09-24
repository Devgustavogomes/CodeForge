import { CodeForgeConfig } from "../../config/types.js";
import { Task } from "../../domain/task.js";
import { GitGateway } from "../../infrastructure/git/GitGateway.js";
import { PATHS } from "../../infrastructure/paths.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { AgentRunner } from "../../runners/AgentRunner.js";
import { PromptService } from "../services/PromptService.js";
import { formatGitDiffSummary } from "../services/diff-formatter.js";

export interface ExecuteReviewInput {
  intentName: string;
  completedTasks: Task[];
  onLog?: (chunk: string) => void;
}

export interface ExecuteReviewResult {
  newTaskIds: string[];
  newTaskFiles: string[];
}

export class ExecuteReviewUseCase {
  constructor(
    private readonly workspace: WorkspaceGateway,
    private readonly git: GitGateway,
    private readonly runner: AgentRunner,
    private readonly promptService: PromptService,
    private readonly config: CodeForgeConfig,
  ) {}

  async execute({ intentName, completedTasks, onLog }: ExecuteReviewInput): Promise<ExecuteReviewResult> {
    const taskDirectory = `${PATHS.tasksDir}/${intentName}`;
    if (!this.workspace.exists(taskDirectory)) {
      this.workspace.mkdir(taskDirectory);
    }

    const before = this.listTaskFiles(taskDirectory);
    const promptPath = this.promptService.createReviewPromptFile(
      intentName,
      completedTasks,
      this.getGitDiffSummary(),
      before,
      this.config.language,
    );

    try {
      await this.runner.execute({
        promptFilePath: promptPath,
        intentName,
        model: this.config.aiReview?.agent ?? "default",
        silent: true,
        quietTerminal: true,
        onLog,
      });

      const newTaskFiles = this.listTaskFiles(taskDirectory)
        .filter((file) => !before.includes(file));
      return {
        newTaskFiles,
        newTaskIds: newTaskFiles.map((file) => file.slice(0, -".json".length)),
      };
    } finally {
      this.promptService.deletePromptFile(promptPath);
    }
  }

  private listTaskFiles(taskDirectory: string): string[] {
    return this.workspace.listDir(taskDirectory)
      // The plan validator examines every JSON file in this directory. Discover
      // the same set so malformed or wrongly named reviewer output cannot be
      // interpreted as an approval.
      .filter((file) => file.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  }

  private getGitDiffSummary(): string {
    return formatGitDiffSummary(this.git);
  }
}

import path from "node:path";
import type { GitDiffRange } from "./diff-formatter.js";
import type { ExecutionRoots } from "../../domain/execution-context.js";
import { Task } from "../../domain/task.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";
import { buildRunningPrompt } from "../../infrastructure/assets/prompts/running.js";
import { buildRetryPrompt } from "../../infrastructure/assets/prompts/retry.js";
import { buildReviewPrompt } from "../../infrastructure/assets/prompts/review.js";

export class PromptService {
  private readonly gw: WorkspaceGateway;
  private readonly promptPaths = new Map<string, string>();

  constructor(gw: WorkspaceGateway, private readonly orchestrationRoot: string = process.cwd()) {
    this.gw = gw.executionWorkspace();
  }

  private defaultRoots(): ExecutionRoots {
    return { orchestrationRoot: this.orchestrationRoot, executionRoot: this.orchestrationRoot };
  }

  private contextReferences(intentName: string, taskId: string | undefined, roots: ExecutionRoots): string {
    return [
      "--- EXECUTION CONTEXT ---",
      `Execution directory: ${path.resolve(roots.executionRoot)}`,
      `Central orchestration directory: ${path.resolve(roots.orchestrationRoot)}`,
      ...(taskId ? [`Task definition: ${path.resolve(roots.orchestrationRoot, PATHS.taskFile(intentName, taskId))}`] : []),
      `Running rules: ${path.resolve(roots.orchestrationRoot, PATHS.runningRules)}`,
      `Review rules: ${path.resolve(roots.orchestrationRoot, PATHS.reviewRules)}`,
      `Documentation: ${path.resolve(roots.orchestrationRoot, PATHS.docsDir)}`,
      "Resolve .codeforge references in task context, rules, and documentation against the central orchestration directory.",
      "Inspect and edit source files only in the execution directory. Do not copy central execution state or ignored user files into it.",
    ].join("\n");
  }

  private writePrompt(relativePath: string, content: string, roots: ExecutionRoots): string {
    this.gw.writeFile(relativePath, content);
    const absolutePath = path.resolve(roots.orchestrationRoot, relativePath);
    this.promptPaths.set(absolutePath, relativePath);
    return absolutePath;
  }

  private buildContextPrompt(
    intentName: string,
    task: Task,
    language: string,
    previousErrors?: string[],
    roots: ExecutionRoots = this.defaultRoots(),
  ): string {
    const intentPath = path.resolve(roots.orchestrationRoot, PATHS.intentFile(intentName));
    const intentRef = `Intent: ${intentName} (${intentPath})`;

    let filesContext = "";
    if (task.files && task.files.length > 0) {
      for (const file of task.files) {
        const sourcePath = path.resolve(roots.executionRoot, file);
        const gatewayPath = path.relative(roots.orchestrationRoot, sourcePath);
        if (this.gw.exists(gatewayPath)) {
          filesContext += `\n### File: ${file}\nPath: ${sourcePath}\n`;
        } else {
          filesContext += `\n### File: ${file}\nPath: ${sourcePath}\n(File does not exist yet. You will need to create it.)\n`;
        }
      }
    } else {
      filesContext = "No specific files provided in context.";
    }

    const runningRulesPath = PATHS.runningRules;
    const runningRulesContent = this.gw.exists(runningRulesPath) ? this.gw.readFile(runningRulesPath) : "";

    if (previousErrors && previousErrors.length > 0) {
      return buildRetryPrompt(task, intentRef, runningRulesContent, filesContext, previousErrors, language, this.contextReferences(intentName, task.id, roots));
    }

    return buildRunningPrompt(task, intentRef, runningRulesContent, filesContext, language, this.contextReferences(intentName, task.id, roots));
  }

  createPromptFile(
    intentName: string,
    task: Task,
    language: string,
    previousErrors?: string[],
    roots: ExecutionRoots = this.defaultRoots(),
  ): string {
    const intentExecDir = `${PATHS.executionsDir}/${intentName}`;
    if (!this.gw.exists(intentExecDir)) {
      this.gw.mkdir(intentExecDir);
    }
    const promptPath = `${intentExecDir}/${task.id}.temp.prompt.md`;
    const promptContent = this.buildContextPrompt(intentName, task, language, previousErrors, roots);
    return this.writePrompt(promptPath, promptContent, roots);
  }

  createConflictPromptFile(
    intentName: string, task: Task, language: string,
    resolution: import("../../domain/execution.js").ConflictResolutionRecord,
    roots: ExecutionRoots,
  ): string {
    const directory = PATHS.executionsDir + "/" + intentName;
    if (!this.gw.exists(directory)) this.gw.mkdir(directory);
    return this.writePrompt(directory + "/" + task.id + ".conflict-" + resolution.attempts + ".prompt.md", [
      this.buildContextPrompt(intentName, task, language, undefined, roots),
      "--- INTEGRATION CONFLICT RESOLUTION ---",
      "Conflict identity: " + resolution.id,
      "Incoming result: " + resolution.incomingCommit,
      "Last accepted integration: " + resolution.lastAcceptedCommit,
      "Automatic attempt: " + resolution.attempts + " of 2",
      "Conflicted files: " + resolution.conflicts.join(", "),
      ...resolution.diagnostics,
      "Resolve the integration conflict in the execution directory, preserving both task results and existing resolution work.",
      "Stage resolved files. Do not commit, abort, reset, or discard the merge. CodeForge runs task.verify gates and finalizes the merge after approval.",
    ].join("\n\n"), roots);
  }

  createReviewPromptFile(
    intentName: string,
    completedTasks: Task[],
    gitDiffSummary: string,
    existingTaskFiles: string[],
    language: string,
    roots: ExecutionRoots = this.defaultRoots(),
    accumulatedResult?: GitDiffRange,
  ): string {
    const intentExecDir = `${PATHS.executionsDir}/${intentName}`;
    if (!this.gw.exists(intentExecDir)) {
      this.gw.mkdir(intentExecDir);
    }

    const intentPath = PATHS.intentFile(intentName);
    const intentContent = this.gw.exists(intentPath)
      ? this.gw.readFile(intentPath)
      : "Intent not found.";
    const rulesContent = this.gw.exists(PATHS.reviewRules)
      ? this.gw.readFile(PATHS.reviewRules)
      : "";
    const promptPath = PATHS.reviewPrompt(intentName);
    return this.writePrompt(promptPath, buildReviewPrompt(
      intentName,
      intentContent,
      completedTasks,
      gitDiffSummary,
      rulesContent,
      existingTaskFiles,
      language,
      path.resolve(roots.orchestrationRoot, PATHS.tasksDir, intentName),
      this.contextReferences(intentName, undefined, roots),
      accumulatedResult,
    ), roots);
  }

  deletePromptFile(promptPath: string): void {
    const absolutePath = promptPath;
    promptPath = this.promptPaths.get(promptPath)
      ?? (path.isAbsolute(promptPath) ? path.relative(this.orchestrationRoot, promptPath) : promptPath);
    this.promptPaths.delete(absolutePath);
    if (this.gw.exists(promptPath)) {
      this.gw.deleteFile(promptPath);
    }
    const normalized = promptPath.replace(/\\/g, "/");
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash !== -1) {
      const dir = normalized.substring(0, lastSlash);
      if (this.gw.exists(dir) && this.gw.listDir(dir).length === 0) {
        this.gw.deleteDir(dir);
      }
    }
  }

  deletePromptDir(intentName: string): void {
    const intentExecDir = `${PATHS.executionsDir}/${intentName}`;
    if (this.gw.exists(intentExecDir)) {
      this.gw.deleteDir(intentExecDir);
    }
  }
}

/**
 * Cleans up after success; failed or interrupted operations retain their recovery context.
 */
export async function executeWithTempPrompt<T>(
  gw: WorkspaceGateway,
  promptPath: string,
  promptContent: string,
  action: () => Promise<T>,
): Promise<T> {
  const normalized = promptPath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash !== -1) {
    const dir = normalized.substring(0, lastSlash);
    if (!gw.exists(dir)) {
      gw.mkdir(dir);
    }
  }

  gw.writeFile(promptPath, promptContent);
  const result = await action();
  if (gw.exists(promptPath)) {
    gw.deleteFile(promptPath);
  }
  return result;
}

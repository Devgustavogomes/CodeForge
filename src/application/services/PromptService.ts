import { Task } from "../../domain/task.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";
import { buildRunningPrompt } from "../../infrastructure/assets/prompts/running.js";
import { buildRetryPrompt } from "../../infrastructure/assets/prompts/retry.js";

export class PromptService {
  constructor(private gw: WorkspaceGateway) {}

  private buildContextPrompt(
    specName: string,
    task: Task,
    language: string,
    previousErrors?: string[]
  ): string {
    const specPath = PATHS.specFile(specName);
    const specContent = this.gw.exists(specPath) ? this.gw.readFile(specPath) : "Spec not found.";

    let filesContext = "";
    if (task.files && task.files.length > 0) {
      for (const file of task.files) {
        if (this.gw.exists(file)) {
          filesContext += `\n### File: ${file}\n`;
        } else {
          filesContext += `\n### File: ${file}\n(File does not exist yet. You will need to create it.)\n`;
        }
      }
    } else {
      filesContext = "No specific files provided in context.";
    }

    const runningRulesPath = PATHS.runningRules;
    const runningRulesContent = this.gw.exists(runningRulesPath) ? this.gw.readFile(runningRulesPath) : "Execution rules not found.";

    if (previousErrors && previousErrors.length > 0) {
      return buildRetryPrompt(task, specContent, runningRulesContent, filesContext, previousErrors, language);
    }

    return buildRunningPrompt(task, specContent, runningRulesContent, filesContext, language);
  }

  createPromptFile(
    specName: string,
    task: Task,
    language: string,
    previousErrors?: string[]
  ): string {
    const specExecDir = `${PATHS.executionsDir}/${specName}`;
    if (!this.gw.exists(specExecDir)) {
      this.gw.mkdir(specExecDir);
    }
    const promptPath = `${specExecDir}/${task.id}.temp.prompt.md`;
    const promptContent = this.buildContextPrompt(specName, task, language, previousErrors);
    this.gw.writeFile(promptPath, promptContent);
    return promptPath;
  }

  deletePromptFile(promptPath: string): void {
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

  deletePromptDir(specName: string): void {
    const specExecDir = `${PATHS.executionsDir}/${specName}`;
    if (this.gw.exists(specExecDir)) {
      this.gw.deleteDir(specExecDir);
    }
  }
}

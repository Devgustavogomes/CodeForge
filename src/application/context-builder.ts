import { Task } from "../domain/task.js";
import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { PATHS } from "../infrastructure/paths.js";
import { buildRunningPrompt } from "../prompts/running.js";

export function buildContextPrompt(gw: WorkspaceGateway, specName: string, task: Task): string {
  const specPath = PATHS.specFile(specName);
  const specContent = gw.exists(specPath) ? gw.readFile(specPath) : "Spec not found.";

  let filesContext = "";
  if (task.files && task.files.length > 0) {
    for (const file of task.files) {
      if (gw.exists(file)) {
        filesContext += `\n### File: ${file}\n`;
      } else {
        filesContext += `\n### File: ${file}\n(File does not exist yet. You will need to create it.)\n`;
      }
    }
  } else {
    filesContext = "No specific files provided in context.";
  }

  const runningRulesPath = PATHS.runningRules;
  const runningRulesContent = gw.exists(runningRulesPath) ? gw.readFile(runningRulesPath) : "Execution rules not found.";

  return buildRunningPrompt(task, specContent, runningRulesContent, filesContext);
}

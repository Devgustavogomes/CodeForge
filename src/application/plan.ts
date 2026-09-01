import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { PATHS } from "../infrastructure/paths.js";
import { buildPlanningPrompt } from "../prompts/planning.js";

export type PlanResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "ready"; prompt: string };

export function getAvailableSpecs(gw: WorkspaceGateway): string[] {
  if (!gw.exists(PATHS.specsDir)) {
    return [];
  }

  const files = gw.listDir(PATHS.specsDir);
  return files
    .filter(file => file.endsWith(".md"))
    .map(file => file.replace(/\.md$/, ""));
}

export function preparePlanningPrompt(gw: WorkspaceGateway, specName: string, language: string): PlanResult {
  if (!gw.exists(PATHS.metadata)) {
    return { kind: "not-initialized" };
  }

  const specPath = PATHS.specFile(specName);
  if (!gw.exists(specPath)) {
    return { kind: "spec-not-found" };
  }

  let rulesContent = "";
  if (gw.exists(PATHS.planningRules)) {
    rulesContent = gw.readFile(PATHS.planningRules);
  }

  const specContent = gw.readFile(specPath);

  // Create tasks directory for this spec if it doesn't exist
  const specTasksDir = `${PATHS.tasksDir}/${specName}`;
  if (!gw.exists(specTasksDir)) {
    gw.mkdir(specTasksDir);
  }

  const prompt = buildPlanningPrompt(specName, specContent, rulesContent, specTasksDir, language);

  return {
    kind: "ready",
    prompt
  };
}

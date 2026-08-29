import fs from "node:fs";
import path from "node:path";

const CODEFORGE_DIR = ".codeforge";

export type PlanResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "ready"; prompt: string };

export function getAvailableSpecs(workspacePath: string): string[] {
  const specsDir = path.join(workspacePath, CODEFORGE_DIR, "specs");
  
  if (!fs.existsSync(specsDir)) {
    return [];
  }

  const files = fs.readdirSync(specsDir);
  return files
    .filter(file => file.endsWith(".md"))
    .map(file => file.replace(/\.md$/, ""));
}

export function preparePlanningPrompt(workspacePath: string, specName: string): PlanResult {
  const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);
  const metadataPath = path.join(codeforgeRoot, "metadata.json");

  if (!fs.existsSync(metadataPath)) {
    return { kind: "not-initialized" };
  }

  const specPath = path.join(codeforgeRoot, "specs", `${specName}.md`);
  if (!fs.existsSync(specPath)) {
    return { kind: "spec-not-found" };
  }

  const rulesPath = path.join(codeforgeRoot, "rules", "planning.md");
  let rulesContent = "";
  if (fs.existsSync(rulesPath)) {
    rulesContent = fs.readFileSync(rulesPath, "utf-8");
  }

  const specContent = fs.readFileSync(specPath, "utf-8");

  // Create tasks directory for this spec if it doesn't exist
  const specTasksDir = path.join(codeforgeRoot, "tasks", specName);
  if (!fs.existsSync(specTasksDir)) {
    fs.mkdirSync(specTasksDir, { recursive: true });
  }

  const prompt = `SYSTEM PROMPT FOR AI AGENT:
You have been requested to plan the spec '${specName}'.

--- RULES ---
${rulesContent}

--- SPEC: ${specName} ---
${specContent}

--- ACTION REQUIRED ---
1. Generate the JSON files and save them in .codeforge/tasks/${specName}/
2. RUN THE VALIDATION COMMAND: codeforge plan validate ${specName}
3. If validation fails, fix the errors and run it again. Do not stop until it passes.
4. Once validation passes, present the generated tasks to the user for review. Show each task's ID, title, and dependencies. Ask the user to verify and approve the plan. If the user approves, tell them to open a NEW, clean session in their AI agent and run the command: codeforge run ${specName}`;

  return {
    kind: "ready",
    prompt
  };
}

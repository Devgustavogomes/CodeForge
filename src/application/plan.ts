import fs from "node:fs";
import path from "node:path";

const CODEFORGE_DIR = ".codeforge";

export interface PlanResult {
  notInitialized: boolean;
  specNotFound: boolean;
  prompt: string;
}

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
    return { notInitialized: true, specNotFound: false, prompt: "" };
  }

  const specPath = path.join(codeforgeRoot, "specs", `${specName}.md`);
  if (!fs.existsSync(specPath)) {
    return { notInitialized: false, specNotFound: true, prompt: "" };
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
Please generate the JSON files and save them in .codeforge/tasks/${specName}/`;

  return {
    notInitialized: false,
    specNotFound: false,
    prompt
  };
}

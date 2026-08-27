import fs from "node:fs";
import path from "node:path";
import { Task } from "../domain/task.js";

const CODEFORGE_DIR = ".codeforge";

export function buildContextPrompt(workspacePath: string, specName: string, task: Task): string {
  const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);
  
  const specPath = path.join(codeforgeRoot, "specs", `${specName}.md`);
  const specContent = fs.existsSync(specPath) ? fs.readFileSync(specPath, "utf-8") : "Spec not found.";

  let filesContext = "";
  if (task.files && task.files.length > 0) {
    for (const file of task.files) {
      const fullPath = path.join(workspacePath, file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        filesContext += `\n### File: ${file}\n\`\`\`\n${content}\n\`\`\`\n`;
      } else {
        filesContext += `\n### File: ${file}\n(File does not exist yet. You will need to create it.)\n`;
      }
    }
  } else {
    filesContext = "No specific files provided in context.";
  }

  return `SYSTEM PROMPT FOR AI AGENT (CodeForge Execution)

You are tasked with implementing: ${task.id} - ${task.title}

--- TASK DEFINITION ---
Objective: ${task.objective}
Context: ${task.context}

Implementation Steps:
${task.implementation}

Constraints:
${task.constraints?.length ? "- " + task.constraints.join("\n- ") : "None"}

Acceptance Criteria:
${task.acceptanceCriteria?.length ? "- " + task.acceptanceCriteria.join("\n- ") : "None"}

--- SOURCE CODE CONTEXT ---
${filesContext}

--- OVERALL SPECIFICATION ---
${specContent}

--- ACTION REQUIRED ---
Please implement the code required for this task. Modify or create the files as instructed.
Do not implement tasks that belong to other steps. Focus only on this specific task.
`;
}

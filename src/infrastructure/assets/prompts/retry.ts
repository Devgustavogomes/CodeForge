import { Task } from "../../../domain/task.js";

export function buildRetryPrompt(
  task: Task,
  intentRef: string,
  rulesContent: string,
  filesContext: string,
  errors: string[],
  language: string
): string {
  const userRules = rulesContent && rulesContent.trim().length > 0
    ? `\n--- PROJECT CODING RULES ---\n${rulesContent.trim()}\n`
    : "";

  const formattedErrors = errors.map((e) => `- ${e}`).join("\n");

  const constraints = task.constraints?.length
    ? task.constraints.map((c) => `- ${c}`).join("\n")
    : "- None";

  const acceptance = task.acceptanceCriteria?.length
    ? task.acceptanceCriteria.map((a) => `- ${a}`).join("\n")
    : "- None";

  return `CodeForge task retry | ${task.id}: ${task.title}
${intentRef}

--- PREVIOUS ATTEMPT FAILURE & ERRORS ---
${formattedErrors}
Objective: ${task.objective}
Context: ${task.context}
Implementation steps: ${task.implementation}
Constraints:
${constraints}
Acceptance criteria:
${acceptance}
Target files:
${filesContext}
${userRules}
Rules:
- Fix the error causes while preserving valid work, then complete this task's remaining steps.
- Implement only this assigned task and satisfy its acceptance criteria.
- Do not edit task JSON files in .codeforge/tasks/.
- Write generated prose in ${language}; preserve JSON keys and technical code terms.`;
}

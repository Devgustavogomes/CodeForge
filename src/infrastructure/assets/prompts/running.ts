import { Task } from "../../../domain/task.js";

export function buildRunningPrompt(
  task: Task,
  intentRef: string,
  rulesContent: string,
  filesContext: string,
  language: string
): string {
  const userRules = rulesContent && rulesContent.trim().length > 0
    ? `\n--- PROJECT CODING RULES ---\n${rulesContent.trim()}\n`
    : "";

  const constraints = task.constraints?.length
    ? task.constraints.map((c) => `- ${c}`).join("\n")
    : "- None";

  const acceptance = task.acceptanceCriteria?.length
    ? task.acceptanceCriteria.map((a) => `- ${a}`).join("\n")
    : "- None";

  return `CodeForge task execution | ${task.id}: ${task.title}
${intentRef}

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
- Implement only this assigned task and satisfy its acceptance criteria.
- Do not edit task JSON files in .codeforge/tasks/.
- Write generated prose in ${language}; preserve JSON keys and technical code terms.`;
}

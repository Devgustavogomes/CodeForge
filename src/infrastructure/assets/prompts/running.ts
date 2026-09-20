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

  return `SYSTEM PROMPT FOR AI AGENT (CodeForge Execution)
Task: ${task.id} - ${task.title}
${intentRef}

--- OBJECTIVE ---
${task.objective}

--- CONTEXT ---
${task.context}

--- IMPLEMENTATION STEPS ---
${task.implementation}

--- CONSTRAINTS ---
${constraints}

--- ACCEPTANCE CRITERIA ---
${acceptance}

--- TARGET FILES ---
${filesContext}
${userRules}
--- OPERATIONAL RULES ---
1. Implement ONLY the assigned task. Satisfy all acceptance criteria.
2. Do not modify other tasks or task JSON files in .codeforge/tasks/.
3. All code comments, documentation, and commit messages must be in ${language}.`;
}

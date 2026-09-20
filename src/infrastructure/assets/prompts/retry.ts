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

  return `SYSTEM PROMPT FOR AI AGENT (CodeForge Task Retry & Fix)
Task: ${task.id} - ${task.title}
${intentRef}

--- PREVIOUS ATTEMPT FAILURE & ERRORS ---
The previous execution of this task failed with the following error(s):
${formattedErrors}

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
--- ACTION REQUIRED (ERROR RESOLUTION & COMPLETION) ---
1. Fix the root cause of the previous error(s) without discarding valid work.
2. Complete all remaining implementation steps to satisfy all acceptance criteria.
3. Implement ONLY the assigned task. Do not modify task JSON files.
4. All code comments, documentation, and commit messages must be in ${language}.`;
}

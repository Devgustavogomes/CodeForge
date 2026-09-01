import { Task } from "../domain/task.js";

export function buildRunningPrompt(
  task: Task,
  specContent: string,
  rulesContent: string,
  filesContext: string,
  language: string
): string {
  return `SYSTEM PROMPT FOR AI AGENT (CodeForge Execution)

--- EXECUTION RULES ---
${rulesContent}

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
--- INSTRUCTION ---
All your output, documentation, and task descriptions MUST be written in ${language}.
`;
}

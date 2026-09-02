import { Task } from "../../../domain/task.js";

export function buildRetryPrompt(
  task: Task,
  specContent: string,
  rulesContent: string,
  filesContext: string,
  errors: string[],
  language: string
): string {
  const formattedErrors = errors.map((e) => `- ${e}`).join("\n");

  return `SYSTEM PROMPT FOR AI AGENT (CodeForge Task Retry & Fix)

--- EXECUTION RULES ---
${rulesContent}

--- PREVIOUS ATTEMPT FAILURE & ERRORS ---
The previous execution of this task failed with the following error(s):
${formattedErrors}

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

--- ACTION REQUIRED (ERROR RESOLUTION & COMPLETION) ---
1. Carefully review the error(s) reported in the previous run.
2. Inspect the current state of modified files to diagnose why the failure occurred.
3. Fix the underlying issue without discarding valid work already completed.
4. Implement any remaining steps required to satisfy all Acceptance Criteria.
5. Do not modify or complete tasks belonging to other steps.

--- INSTRUCTION ---
All your output, documentation, and task descriptions MUST be written in ${language}.
`;
}

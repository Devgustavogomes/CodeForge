export function buildPlanningPrompt(
  intentName: string,
  intentContent: string,
  rulesContent: string,
  tasksDir: string,
  language: string,
): string {
  const userRules = rulesContent?.trim()
    ? `\n--- PROJECT PLANNING RULES ---\n${rulesContent.trim()}\n`
    : "";

  return `Decompose intent '${intentName}' into atomic tasks. Preserve scope; do not invent features or write source code. Write generated prose in ${language}; preserve JSON keys and technical code terms.

--- TASK SIZE & GRANULARITY ---
### Unit of work
A Task must be:
- Implementable — the agent can complete it in a single context window.
- Coherent — it represents a meaningful unit of work, not an arbitrary split.
- Verifiable — it has clear acceptance criteria that can be checked.

### Granularity
Do NOT create Tasks that are too small:
\`\`\`
❌ TASK-001 → create file
❌ TASK-002 → create class
❌ TASK-003 → add method
\`\`\`

Do NOT create Tasks that are too large:
\`\`\`
❌ TASK-001 → implement the entire feature
\`\`\`

Aim for a coherent slice. For example, implementing a use case may include its controller, DTO, use case class, repository call — if they form a single coherent unit.

Write each task as one JSON object to '${tasksDir}/TASK-XXX.json'. Required fields:
{"id":"TASK-001","title":"...","objective":"...","context":"...","implementation":"...","files":["..."],"dependencies":[],"constraints":["..."],"acceptanceCriteria":["..."]}
Dependencies must reference valid task IDs and form a DAG.
${userRules}
--- INTENT ---
${intentContent}

Create the task JSON files in '${tasksDir}'.`;
}

export function buildPlanningFixPrompt(
  intentName: string,
  errors: string[],
  language: string,
  tasksDir: string,
): string {
  const errorsList = errors.map((e) => `- ${e}`).join("\n");
  return `Fix the invalid plan for intent '${intentName}'. Preserve intent scope; do not invent features or write source code. Write generated prose in ${language}; preserve JSON keys and technical code terms.

Write each task as one JSON object to '${tasksDir}/TASK-XXX.json' with exactly these fields: {"id":"TASK-001","title":"...","objective":"...","context":"...","implementation":"...","files":["..."],"dependencies":[],"constraints":["..."],"acceptanceCriteria":["..."]}. Dependencies must reference valid task IDs and form a DAG.

Validation errors:\n${errorsList}`;
}

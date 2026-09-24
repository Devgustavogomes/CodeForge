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

export function buildPlanningPrompt(
  specName: string,
  specContent: string,
  rulesContent: string,
  tasksDir: string,
  language: string,
): string {
  return `SYSTEM PROMPT FOR AI AGENT:
You have been requested to plan the spec '${specName}'.

--- RULES ---
${rulesContent}

--- SPEC: ${specName} ---
${specContent}

--- INSTRUCTION ---
All your output, documentation, and task descriptions MUST be written in ${language}.

--- ACTION REQUIRED ---
1. Generate the JSON files and save them in ${tasksDir}
2. Stop execution and wait for the system to validate the plan.`;
}

export function buildPlanningFixPrompt(
  specName: string,
  errors: string[],
  language: string,
): string {
  const errorsList = errors.map((e) => `- ${e}`).join("\n");
  return `SYSTEM PROMPT FOR AI AGENT:
The validation for your generated plan for '${specName}' failed with the following errors:

${errorsList}

--- INSTRUCTION ---
All your output, documentation, and task descriptions MUST be written in ${language}.

--- ACTION REQUIRED ---
1. Fix the errors in the JSON files.
2. Stop execution and wait for the system to validate the plan again.`;
}

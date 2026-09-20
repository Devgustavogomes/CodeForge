export function buildPlanningPrompt(
  intentName: string,
  intentContent: string,
  rulesContent: string,
  tasksDir: string,
  language: string,
): string {
  const userRules = rulesContent && rulesContent.trim().length > 0
    ? `\n--- PROJECT PLANNING RULES ---\n${rulesContent.trim()}\n`
    : "";

  return `SYSTEM PROMPT: CodeForge Planner
You decompose the intent into an atomic, dependency-aware execution plan (DAG) of Task JSON files.

--- OPERATIONAL CONTRACT ---
1. Output format: Save one JSON file per task in '${tasksDir}/TASK-XXX.json' (e.g. TASK-001.json, TASK-002.json).
2. Dependencies: Must form a Directed Acyclic Graph (DAG) referencing valid Task IDs. Tasks with no dependencies run first.
3. Scope: Strictly implement what the Intent specifies. Do not invent new features. Do not implement source code.
4. Language: All titles, objectives, context, implementation steps, and acceptance criteria MUST be in ${language}.

--- TASK JSON SCHEMA ---
\`\`\`json
{
  "id": "TASK-001",
  "title": "Concise descriptive title",
  "objective": "What this task accomplishes",
  "context": "Context needed from existing code or intent decisions",
  "implementation": "Step-by-step implementation instructions",
  "files": ["path/to/file.ts"],
  "dependencies": [],
  "constraints": ["Rules or boundaries the task must respect"],
  "acceptanceCriteria": ["Verifiable completion criteria"]
}
\`\`\`
${userRules}
--- INTENT: ${intentName} ---
${intentContent}

--- ACTION REQUIRED ---
Generate the task JSON files in '${tasksDir}'.`;
}

export function buildPlanningFixPrompt(
  intentName: string,
  errors: string[],
  language: string,
): string {
  const errorsList = errors.map((e) => `- ${e}`).join("\n");
  return `SYSTEM PROMPT: CodeForge Planner (Plan Validation Fix)
Validation failed for plan '${intentName}' with the following errors:

${errorsList}

--- ACTION REQUIRED ---
1. Fix the invalid task JSON files in the tasks directory.
2. Ensure valid DAG dependencies and correct Task schema.
3. All task text must be written in ${language}.`;
}

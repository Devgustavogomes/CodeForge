export function buildPlanningPrompt(
  specName: string,
  specContent: string,
  rulesContent: string,
  tasksDir: string
): string {
  return `SYSTEM PROMPT FOR AI AGENT:
You have been requested to plan the spec '${specName}'.

--- RULES ---
${rulesContent}

--- SPEC: ${specName} ---
${specContent}

--- ACTION REQUIRED ---
1. Generate the JSON files and save them in ${tasksDir}
2. RUN THE VALIDATION COMMAND: codeforge plan validate ${specName}
3. If validation fails, fix the errors and run it again. Do not stop until it passes.
4. Once validation passes, present the generated tasks to the user for review. Show each task's ID, title, and dependencies. Ask the user to verify and approve the plan. If the user approves, tell them to open a NEW, clean session in their AI agent and run the command: codeforge run ${specName}`;
}

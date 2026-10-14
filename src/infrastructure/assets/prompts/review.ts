import path from "node:path";
import type { GitDiffRange } from "../../../application/services/diff-formatter.js";
import { Task } from "../../../domain/task.js";

const localized = {
  en: {
    completed: "Completed tasks",
    changes: "Changed-code context",
    existing: "Existing task files",
    instruction: "Review using the configured English guidance. Write generated prose in English; preserve JSON keys and technical code terms.",
  },
  pt: {
    completed: "Tarefas concluídas",
    changes: "Contexto das alterações de código",
    existing: "Arquivos de tarefa existentes",
    instruction: "Revise usando as orientações configuradas em português. Escreva o texto gerado em português; preserve as chaves JSON e os termos técnicos de código.",
  },
  es: {
    completed: "Tareas completadas",
    changes: "Contexto de cambios de código",
    existing: "Archivos de tarea existentes",
    instruction: "Revise usando las indicaciones configuradas en español. Escriba el texto generado en español; conserve las claves JSON y los términos técnicos de código.",
  },
} as const;

export function buildReviewPrompt(
  intentName: string,
  intentContent: string,
  completedTasks: Task[],
  gitDiffSummary: string,
  rulesContent: string,
  existingTaskFiles: string[],
  language: string,
  taskDirectory: string = path.resolve(`.codeforge/tasks/${intentName}`),
  executionContext: string = "",
  accumulatedResult?: GitDiffRange,
): string {
  const copy = localized[language as keyof typeof localized] ?? localized.en;
  const completedTaskContext = completedTasks.length === 0
    ? "No completed task details were provided."
    : completedTasks.map((task) => `- ${task.id}: ${task.title}\n  Objective: ${task.objective}\n  Acceptance criteria: ${task.acceptanceCriteria.join("; ") || "None specified"}`).join("\n");

  const projectCriteria = rulesContent.trim()
    ? `\n\n--- PROJECT REVIEW CRITERIA ---\n${rulesContent.trim()}`
    : "";

  return `SYSTEM PROMPT FOR AI AGENT (CodeForge Review)

You are reviewing the completed implementation for intent '${intentName}'.
${executionContext}
${accumulatedResult ? `
--- ACCUMULATED RESULT ---
Original base commit: ${accumulatedResult.baseCommit}
Accepted integration commit: ${accumulatedResult.resultCommit}
Review the recorded commit range in the integration execution directory. The original checkout may have no changes. Include added, deleted, and renamed files.
` : ""}

--- ORIGINAL INTENT ---
${intentContent}

--- ${copy.completed.toUpperCase()} ---
${completedTaskContext}

--- ${copy.changes.toUpperCase()} ---
${gitDiffSummary}

--- ${copy.existing.toUpperCase()} ---
${existingTaskFiles.length > 0 ? existingTaskFiles.join("\n") : "No existing task files."}

--- LANGUAGE GUIDANCE ---
${copy.instruction}
The configured review language is '${language}'.

--- ACTION REQUIRED ---
Inspect the workspace and verify the implementation against the intent and completed task acceptance criteria. Create zero files when approved; silence is the only approval signal. Create task files only for concrete, verified defects. For each defect, create a separate task file at ${path.join(taskDirectory, "TASK-XXX.json")}, continuing from the highest existing task number and never overwriting or duplicating an ID. Use this compact schema with all fields: {"id":"TASK-XXX","title":"","objective":"","context":"","implementation":"","files":[],"dependencies":[],"constraints":[],"acceptanceCriteria":[]}. Keep dependencies valid and the full task graph acyclic. Create no other files and do not fix source code yourself; report defects only as tasks.${projectCriteria}`;
}

import { Task } from "../../../domain/task.js";

const localized = {
  en: {
    completed: "Completed tasks",
    changes: "Changed-code context",
    existing: "Existing task files",
    instruction: "Review using the configured English guidance.",
  },
  pt: {
    completed: "Tarefas concluídas",
    changes: "Contexto das alterações de código",
    existing: "Arquivos de tarefa existentes",
    instruction: "Revise usando as orientações configuradas em português.",
  },
  es: {
    completed: "Tareas completadas",
    changes: "Contexto de cambios de código",
    existing: "Archivos de tarea existentes",
    instruction: "Revise usando las indicaciones configuradas en español.",
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
): string {
  const copy = localized[language as keyof typeof localized] ?? localized.en;
  const completedTaskContext = completedTasks.length === 0
    ? "No completed task details were provided."
    : completedTasks.map((task) => `- ${task.id}: ${task.title}\n  Objective: ${task.objective}\n  Acceptance criteria: ${task.acceptanceCriteria.join("; ") || "None specified"}`).join("\n");

  return `SYSTEM PROMPT FOR AI AGENT (CodeForge Review)

You are reviewing the completed implementation for intent '${intentName}'.

--- REVIEW RULES ---
${rulesContent}

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
The configured review language is '${language}'. Generated task JSON titles, descriptions, and acceptance criteria MUST be in English.

--- ACTION REQUIRED ---
Inspect the workspace and review the implementation. If it is approved, create no files. If deficiencies exist, create only the required TASK-XXX.json files in .codeforge/tasks/${intentName}/, continuing from the highest existing task number and preserving valid DAG dependencies.`;
}

import { Task } from '../../../../domain/task.js';
import { TaskStatus } from '../../../../domain/execution.js';
import { PATHS } from '../../../../infrastructure/paths.js';
import { WorkspaceGateway } from '../../../../infrastructure/workspace.js';
import { ExecutionStateRepository } from '../../../../infrastructure/repositories/ExecutionStateRepository.js';

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  dependencies: string[];
  startedAt?: string;
  completedAt?: string;
  errors?: string[];
  objective?: string;
  files?: string[];
  context?: string;
  constraints?: string[];
  acceptanceCriteria?: string[];
}

/**
 * Pure function to load task JSON definitions from disk and merge with execution status.
 */
export function loadTasksFromDisk(
  gw: WorkspaceGateway,
  stateRepo: ExecutionStateRepository,
  intentName: string,
): TaskItem[] {
  const tasksDir = `${PATHS.tasksDir}/${intentName}`;
  const taskDefs: Task[] = [];

  if (gw.exists(tasksDir)) {
    const files = gw.listDir(tasksDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = gw.readFile(`${tasksDir}/${file}`);
        taskDefs.push(JSON.parse(content) as Task);
      } catch {
        // Ignore unreadable or invalid task files
      }
    }
  }

  const state = stateRepo.load(intentName);
  const seen = new Set<string>();
  const items: TaskItem[] = [];

  for (const def of taskDefs) {
    seen.add(def.id);
    const taskState = state?.tasks[def.id];
    items.push({
      id: def.id,
      title: def.title || def.id,
      status: taskState?.status ?? 'pending',
      dependencies: def.dependencies || [],
      startedAt: taskState?.startedAt,
      completedAt: taskState?.completedAt,
      errors: taskState?.errors,
      objective: def.objective,
      files: def.files,
      context: def.context,
      constraints: def.constraints,
      acceptanceCriteria: def.acceptanceCriteria,
    });
  }

  if (state?.tasks) {
    for (const [id, taskState] of Object.entries(state.tasks)) {
      if (!seen.has(id)) {
        items.push({
          id,
          title: taskState.title || id,
          status: taskState.status,
          dependencies: taskState.dependencies || [],
          startedAt: taskState.startedAt,
          completedAt: taskState.completedAt,
          errors: taskState.errors,
        });
      }
    }
  }

  return items;
}

export const loadTaskItems = loadTasksFromDisk;

/**
 * Compares two task lists by id, status, startedAt, completedAt, and errors
 * to determine if the state has genuinely changed.
 */
export function areTasksEqual(
  prevTasks: TaskItem[] = [],
  newTasks: TaskItem[] = [],
): boolean {
  if (prevTasks === newTasks) return true;
  if (prevTasks.length !== newTasks.length) return false;

  for (let i = 0; i < prevTasks.length; i++) {
    const prev = prevTasks[i];
    const next = newTasks[i];

    if (prev.id !== next.id) return false;
    if (prev.status !== next.status) return false;
    if (prev.startedAt !== next.startedAt) return false;
    if (prev.completedAt !== next.completedAt) return false;
    if (prev.title !== next.title) return false;

    const prevErrors = prev.errors;
    const nextErrors = next.errors;
    if (prevErrors !== nextErrors) {
      if (!prevErrors || !nextErrors) return false;
      if (prevErrors.length !== nextErrors.length) return false;
      for (let j = 0; j < prevErrors.length; j++) {
        if (prevErrors[j] !== nextErrors[j]) return false;
      }
    }
  }

  return true;
}

/**
 * Pure function to count task definition JSON files for a given intent on disk.
 * Returns 0 if directory does not exist or upon any read error.
 */
export function getIntentTaskCount(
  gw: WorkspaceGateway,
  intentName: string,
): number {
  try {
    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    if (!gw.exists(tasksDir)) {
      return 0;
    }
    return gw.listDir(tasksDir).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}
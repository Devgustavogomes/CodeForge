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
  specName: string,
): TaskItem[] {
  const tasksDir = `${PATHS.tasksDir}/${specName}`;
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

  const state = stateRepo.load(specName);
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

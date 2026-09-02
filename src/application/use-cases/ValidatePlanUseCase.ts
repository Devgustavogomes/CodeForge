import { Task } from "../../domain/task.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";

export type ValidationResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "valid" }
  | { kind: "invalid"; errors: string[] };

function hasCycle(adjList: Map<string, string[]>): string[] | null {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    if (recStack.has(node)) {
      path.push(node);
      return true; // Cycle detected
    }
    if (visited.has(node)) {
      return false;
    }

    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = adjList.get(node) || [];
    for (const neighbor of neighbors) {
      if (dfs(neighbor)) {
        return true;
      }
    }

    recStack.delete(node);
    path.pop();
    return false;
  }

  for (const node of adjList.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) {
        return path;
      }
    }
  }

  return null;
}

export class ValidatePlanUseCase {
  constructor(private readonly gw: WorkspaceGateway) {}

  execute(specName: string, taskId?: string): ValidationResult {
    if (!this.gw.exists(PATHS.metadata)) {
    return { kind: "not-initialized" };
  }

    const tasksDir = `${PATHS.tasksDir}/${specName}`;
    if (!this.gw.exists(tasksDir)) {
      return { kind: "spec-not-found" };
    }

    const errors: string[] = [];
    let files = this.gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));

    if (taskId) {
      const expectedFile = `${taskId}.json`;
      if (!files.includes(expectedFile)) {
        errors.push(`Task file ${expectedFile} not found.`);
        return { kind: "invalid", errors };
      }
      files = [expectedFile];
    }

    if (files.length === 0) {
      errors.push("No JSON files found in tasks directory.");
      return { kind: "invalid", errors };
    }

    const taskMap = new Map<string, Task>();
    const declaredIds = new Set<string>();

    // 1. File parsing and schema validation
    for (const file of files) {
      const filePath = `${tasksDir}/${file}`;
      const raw = this.gw.readFile(filePath);

    let json: Partial<Task>;
    try {
      json = JSON.parse(raw);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`File ${file} is not valid JSON: ${message}`);
      continue;
    }

    const expectedId = file.replace(/\.json$/, "");
    if (!json.id) {
      errors.push(`File ${file} is missing required field: "id"`);
    } else if (json.id !== expectedId) {
      errors.push(
        `File ${file} has id "${json.id}" which does not match filename.`,
      );
    }

    if (json.id && declaredIds.has(json.id)) {
      errors.push(`Duplicate task ID found: ${json.id}`);
    }

    if (json.id) {
      declaredIds.add(json.id);
    }

    const requiredFields = [
      "title",
      "objective",
      "context",
      "implementation",
      "files",
      "dependencies",
      "constraints",
      "acceptanceCriteria",
    ];
    for (const field of requiredFields) {
      if (!(field in json)) {
        errors.push(`Task ${expectedId} is missing required field: "${field}"`);
      }
    }

    if (json.id) {
      taskMap.set(json.id, json as Task);
    }
  }

  // If there are parsing errors, or if we are only validating a single task, return early
  if (errors.length > 0 || taskId) {
    return errors.length === 0 ? { kind: "valid" } : { kind: "invalid", errors };
  }

  // 2. Dependency validation
  const adjList = new Map<string, string[]>();

  for (const [id, task] of taskMap.entries()) {
    adjList.set(id, []);
    if (!Array.isArray(task.dependencies)) {
      errors.push(
        `Task ${id} has invalid dependencies format. Must be an array.`,
      );
      continue;
    }

    for (const dep of task.dependencies) {
      if (!declaredIds.has(dep)) {
        errors.push(`Task ${id} depends on nonexistent task: ${dep}`);
      } else {
        adjList.get(id)!.push(dep);
      }
    }
  }

  if (errors.length > 0) {
    return { kind: "invalid", errors };
  }

  // 3. Cycle detection (DAG validation)
  const cyclePath = hasCycle(adjList);
  if (cyclePath) {
    // Trim the path to show only the cycle part
    const cycleStart = cyclePath[cyclePath.length - 1];
    const startIndex = cyclePath.indexOf(cycleStart);
    const cycle = cyclePath.slice(startIndex);
    errors.push(`Circular dependency detected: ${cycle.join(" -> ")}`);
  }

    return errors.length === 0 ? { kind: "valid" } : { kind: "invalid", errors };
  }
}

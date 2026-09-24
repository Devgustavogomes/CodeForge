import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { PATHS } from "../infrastructure/paths.js";
import { Task } from "../domain/task.js";

export class TaskStorage {
  constructor(private gw: WorkspaceGateway) {}

  loadTasks(intentName: string): Task[] {
    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    if (!this.gw.exists(tasksDir)) {
      return [];
    }
    const files = this.gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
    const tasks: Task[] = [];
    for (const file of files) {
      const content = this.gw.readFile(`${tasksDir}/${file}`);
      tasks.push(JSON.parse(content) as Task);
    }
    return tasks;
  }

  listJsonTaskFiles(intentName: string): string[] {
    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    return this.gw.exists(tasksDir)
      ? this.gw.listDir(tasksDir).filter((file) => file.endsWith(".json"))
      : [];
  }

  /** Removes only files which did not exist when this review attempt began. */
  cleanupReviewOutput(intentName: string, filesBeforeReview: ReadonlySet<string>): void {
    const tasksDir = `${PATHS.tasksDir}/${intentName}`;
    for (const file of this.listJsonTaskFiles(intentName)) {
      if (!filesBeforeReview.has(file)) {
        this.gw.deleteFile(`${tasksDir}/${file}`);
      }
    }
  }
}

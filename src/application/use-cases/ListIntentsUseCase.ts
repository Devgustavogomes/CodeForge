import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";
import { ExecutionStateRepository } from "../../infrastructure/repositories/ExecutionStateRepository.js";

export type IntentStatus = "not_started" | "planned" | "in_progress" | "completed";

export interface IntentInfo {
  name: string;
  title: string;
  status: IntentStatus;
}

export function extractMarkdownTitle(content: string, fallbackName: string): string {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^#+\s+(.+?)(?:\s+#+)?$/);
    if (match) {
      const title = match[1].trim();
      if (title.length > 0) {
        return title;
      }
    }
  }
  return fallbackName;
}

export class ListIntentsUseCase {
  private readonly stateRepo: ExecutionStateRepository;

  constructor(
    private readonly gw: WorkspaceGateway,
    stateRepo?: ExecutionStateRepository,
  ) {
    this.stateRepo = stateRepo ?? new ExecutionStateRepository(gw);
  }

  execute(): IntentInfo[] {
    const dirs = [PATHS.intentsDir].filter((d) => this.gw.exists(d));
    if (dirs.length === 0) {
      return [];
    }

    const intentNamesMap = new Map<string, string>();
    for (const dir of dirs) {
      const files = this.gw.listDir(dir);
      for (const file of files) {
        if (file.endsWith(".md")) {
          const name = file.replace(/\.md$/, "");
          if (!intentNamesMap.has(name)) {
            intentNamesMap.set(name, dir);
          }
        }
      }
    }

    const sortedNames = Array.from(intentNamesMap.keys()).sort();
    return sortedNames.map((name) => this.getIntentInfo(name, intentNamesMap.get(name)!));
  }

  listNames(): string[] {
    return this.execute().map((s) => s.name);
  }

  private getIntentInfo(name: string, dir: string = PATHS.intentsDir): IntentInfo {
    const intentFilePath = `${dir}/${name}.md`;
    let title = name;

    if (this.gw.exists(intentFilePath)) {
      try {
        const content = this.gw.readFile(intentFilePath);
        title = extractMarkdownTitle(content, name);
      } catch {
        title = name;
      }
    }

    const status = this.determineStatus(name);

    return {
      name,
      title,
      status,
    };
  }

  private determineStatus(name: string): IntentStatus {
    const state = this.stateRepo.load(name);
    if (state) {
      return state.status === "completed" ? "completed" : "in_progress";
    }

    const tasksDir = `${PATHS.tasksDir}/${name}`;
    if (this.gw.exists(tasksDir)) {
      const taskFiles = this.gw.listDir(tasksDir).filter((f) => f.endsWith(".json"));
      if (taskFiles.length > 0) {
        return "planned";
      }
    }

    return "not_started";
  }
}

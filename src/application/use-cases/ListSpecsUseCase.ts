import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";

export type SpecStatus = "not_started" | "planned" | "in_progress" | "completed";

export interface SpecInfo {
  name: string;
  title: string;
  status: SpecStatus;
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

export class ListSpecsUseCase {
  constructor(private readonly gw: WorkspaceGateway) {}

  execute(): SpecInfo[] {
    if (!this.gw.exists(PATHS.specsDir)) {
      return [];
    }

    const files = this.gw.listDir(PATHS.specsDir);
    const specNames = files
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(/\.md$/, ""))
      .sort();

    return specNames.map((name) => this.getSpecInfo(name));
  }

  listNames(): string[] {
    return this.execute().map((s) => s.name);
  }

  private getSpecInfo(name: string): SpecInfo {
    const specFilePath = PATHS.specFile(name);
    let title = name;

    if (this.gw.exists(specFilePath)) {
      try {
        const content = this.gw.readFile(specFilePath);
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

  private determineStatus(name: string): SpecStatus {
    const executionPath = PATHS.executionState(name);
    if (this.gw.exists(executionPath)) {
      try {
        const state = JSON.parse(this.gw.readFile(executionPath)) as { status?: string };
        if (state.status === "completed") {
          return "completed";
        }
        return "in_progress";
      } catch {
        return "in_progress";
      }
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

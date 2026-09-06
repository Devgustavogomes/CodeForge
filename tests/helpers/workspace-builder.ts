import yaml from "yaml";
import { InMemoryWorkspaceGateway } from "./in-memory-workspace.js";
import { Task } from "../../src/domain/task.js";
import { PATHS } from "../../src/infrastructure/paths.js";

export class WorkspaceBuilder {
  private readonly gw: InMemoryWorkspaceGateway;

  constructor(gw?: InMemoryWorkspaceGateway) {
    this.gw = gw ?? new InMemoryWorkspaceGateway();
    this.initializeStandardStructure();
  }

  private initializeStandardStructure(): void {
    const dirs = [
      ".codeforge",
      ".codeforge/specs",
      ".codeforge/tasks",
      ".codeforge/executions",
      ".codeforge/docs",
      "specs",
      "tasks",
      "executions",
      "docs",
    ];
    for (const dir of dirs) {
      this.gw.mkdir(dir);
    }
  }

  static aWorkspace(gw?: InMemoryWorkspaceGateway): WorkspaceBuilder {
    return new WorkspaceBuilder(gw);
  }

  withMetadata(meta?: object): this {
    const defaultMeta = {
      initialized: true,
      version: "1.0",
      initializedAt: new Date().toISOString(),
    };
    this.gw.writeFile(PATHS.metadata, JSON.stringify(meta ?? defaultMeta, null, 2));
    return this;
  }

  withConfig(config?: object): this {
    const defaultCfg = {
      version: "1.0",
      environment: "test",
      language: "en",
    };
    const cfg = config ?? defaultCfg;
    const content = typeof cfg === "string" ? cfg : yaml.stringify(cfg);
    this.gw.writeFile(PATHS.config, content);
    return this;
  }

  withSpec(name: string, content?: string): this {
    const defaultContent = `# Spec: ${name}\n\nObjective: Test spec\n`;
    this.gw.writeFile(PATHS.specFile(name), content ?? defaultContent);
    return this;
  }

  withTasks(specName: string, tasks: Task[]): this {
    this.gw.mkdir(`${PATHS.tasksDir}/${specName}`);
    for (const task of tasks) {
      this.gw.writeFile(PATHS.taskFile(specName, task.id), JSON.stringify(task, null, 2));
    }
    return this;
  }

  withExecutionState(specName: string, state: object): this {
    this.gw.mkdir(PATHS.executionsDir);
    this.gw.writeFile(PATHS.executionState(specName), JSON.stringify(state, null, 2));
    return this;
  }

  withFile(relativePath: string, content: string): this {
    this.gw.writeFile(relativePath, content);
    return this;
  }

  build(): InMemoryWorkspaceGateway {
    return this.gw;
  }
}

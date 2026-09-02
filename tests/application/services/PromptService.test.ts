import { describe, it, expect, beforeEach } from "vitest";
import { PromptService } from "../../../src/application/services/PromptService.js";
import { InMemoryWorkspaceGateway } from "../../helpers/in-memory-workspace.js";
import { Task } from "../../../src/domain/task.js";
import { PATHS } from "../../../src/infrastructure/paths.js";

describe("PromptService", () => {
  let gw: InMemoryWorkspaceGateway;
  let service: PromptService;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    service = new PromptService(gw);
    gw.mkdir(".codeforge");
    gw.mkdir(".codeforge/specs");
  });

  it("should create and return prompt file path", () => {
    const specName = "test-spec";
    const task: Task = {
      id: "TASK-1",
      title: "Title",
      objective: "O",
      context: "C",
      implementation: "I",
      files: [],
      dependencies: [],
      constraints: [],
      acceptanceCriteria: []
    };

    const path = service.createPromptFile(specName, task, "typescript");
    
    expect(path).toBe(`${PATHS.executionsDir}/${specName}/${task.id}.temp.prompt.md`);
    expect(gw.exists(path)).toBe(true);
    
    const content = gw.readFile(path);
    expect(content).toContain(task.title);
  });

  it("should delete prompt file and empty parent directory", () => {
    const specName = "test-spec";
    const dir = `${PATHS.executionsDir}/${specName}`;
    const path = `${dir}/TASK-1.temp.prompt.md`;
    gw.mkdir(dir);
    gw.writeFile(path, "content");
    expect(gw.exists(path)).toBe(true);
    expect(gw.exists(dir)).toBe(true);

    service.deletePromptFile(path);
    expect(gw.exists(path)).toBe(false);
    expect(gw.exists(dir)).toBe(false);
  });

  it("should not delete parent directory if other prompt files remain", () => {
    const specName = "test-spec";
    const dir = `${PATHS.executionsDir}/${specName}`;
    const path1 = `${dir}/TASK-1.temp.prompt.md`;
    const path2 = `${dir}/TASK-2.temp.prompt.md`;
    gw.mkdir(dir);
    gw.writeFile(path1, "content 1");
    gw.writeFile(path2, "content 2");

    service.deletePromptFile(path1);
    expect(gw.exists(path1)).toBe(false);
    expect(gw.exists(dir)).toBe(true);

    service.deletePromptFile(path2);
    expect(gw.exists(path2)).toBe(false);
    expect(gw.exists(dir)).toBe(false);
  });

  it("should delete entire prompt directory with deletePromptDir", () => {
    const specName = "test-spec";
    const dir = `${PATHS.executionsDir}/${specName}`;
    gw.mkdir(dir);
    gw.writeFile(`${dir}/TASK-1.temp.prompt.md`, "content");
    expect(gw.exists(dir)).toBe(true);

    service.deletePromptDir(specName);
    expect(gw.exists(dir)).toBe(false);
  });

  it("builds prompt correctly including spec content and task fields", () => {
    gw.writeFile(".codeforge/specs/auth.md", "My Spec Content");

    const task: Task = {
      id: "TASK-001",
      title: "Login",
      objective: "Do login",
      context: "User logs in",
      implementation: "Write code",
      files: [],
      dependencies: [],
      constraints: ["No external APIs"],
      acceptanceCriteria: ["Must work"]
    };

    const path = service.createPromptFile("auth", task, "pt-BR");
    const prompt = gw.readFile(path);

    expect(prompt).toContain("SYSTEM PROMPT FOR AI AGENT (CodeForge Execution)");
    expect(prompt).toContain("TASK-001 - Login");
    expect(prompt).toContain("Objective: Do login");
    expect(prompt).toContain("No specific files provided in context.");
    expect(prompt).toContain("OVERALL SPECIFICATION");
    expect(prompt).toContain("My Spec Content");
    expect(prompt).toContain("Constraints:\n- No external APIs");
  });

  it("injects real file contents if task specifies files", () => {
    gw.writeFile(".codeforge/specs/auth.md", "Spec");

    // Create a real source file in the workspace
    gw.mkdir("src");
    gw.writeFile("src/index.ts", "console.log('hello');");

    const task: Task = {
      id: "TASK-002",
      title: "Update Index",
      objective: "Add hi",
      context: "Context",
      implementation: "Write code",
      files: ["src/index.ts", "src/missing.ts"],
      dependencies: [],
      constraints: [],
      acceptanceCriteria: []
    };

    const path = service.createPromptFile("auth", task, "pt-BR");
    const prompt = gw.readFile(path);

    // It should include the existing file path
    expect(prompt).toContain("### File: src/index.ts");

    // It should note the missing file
    expect(prompt).toContain("### File: src/missing.ts");
    expect(prompt).toContain("(File does not exist yet. You will need to create it.)");
  });
});

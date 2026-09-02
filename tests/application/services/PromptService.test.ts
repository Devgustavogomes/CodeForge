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

  it("should delete prompt file", () => {
    const path = "some/temp/path.md";
    gw.writeFile(path, "content");
    expect(gw.exists(path)).toBe(true);

    service.deletePromptFile(path);
    expect(gw.exists(path)).toBe(false);
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

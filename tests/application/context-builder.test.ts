import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { buildContextPrompt } from "../../src/application/context-builder.js";
import { Task } from "../../src/domain/task.js";

describe("buildContextPrompt", () => {
  let gateway: InMemoryWorkspaceGateway;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
    gateway.mkdir(".codeforge");
    gateway.mkdir(".codeforge/specs");
  });

  it("builds prompt correctly including spec content and task fields", () => {
    gateway.writeFile(".codeforge/specs/auth.md", "My Spec Content");

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

    const prompt = buildContextPrompt(gateway, "auth", task);

    expect(prompt).toContain("SYSTEM PROMPT FOR AI AGENT (CodeForge Execution)");
    expect(prompt).toContain("TASK-001 - Login");
    expect(prompt).toContain("Objective: Do login");
    expect(prompt).toContain("No specific files provided in context.");
    expect(prompt).toContain("OVERALL SPECIFICATION");
    expect(prompt).toContain("My Spec Content");
    expect(prompt).toContain("Constraints:\n- No external APIs");
  });

  it("injects real file contents if task specifies files", () => {
    gateway.writeFile(".codeforge/specs/auth.md", "Spec");

    // Create a real source file in the workspace
    gateway.mkdir("src");
    gateway.writeFile("src/index.ts", "console.log('hello');");

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

    const prompt = buildContextPrompt(gateway, "auth", task);

    // It should include the existing file path
    expect(prompt).toContain("### File: src/index.ts");

    // It should note the missing file
    expect(prompt).toContain("### File: src/missing.ts");
    expect(prompt).toContain("(File does not exist yet. You will need to create it.)");
  });
});

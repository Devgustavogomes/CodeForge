import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildContextPrompt } from "../../src/application/context-builder.js";
import { Task } from "../../src/domain/task.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-test-ctx-"));
}

describe("buildContextPrompt", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    const codeforgeDir = path.join(tempDir, ".codeforge");
    fs.mkdirSync(codeforgeDir);
    fs.mkdirSync(path.join(codeforgeDir, "specs"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("builds prompt correctly including spec content and task fields", () => {
    const specPath = path.join(tempDir, ".codeforge", "specs", "auth.md");
    fs.writeFileSync(specPath, "My Spec Content");

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

    const prompt = buildContextPrompt(tempDir, "auth", task);

    expect(prompt).toContain("SYSTEM PROMPT FOR AI AGENT (CodeForge Execution)");
    expect(prompt).toContain("TASK-001 - Login");
    expect(prompt).toContain("Objective: Do login");
    expect(prompt).toContain("No specific files provided in context.");
    expect(prompt).toContain("OVERALL SPECIFICATION");
    expect(prompt).toContain("My Spec Content");
    expect(prompt).toContain("Constraints:\n- No external APIs");
  });

  it("injects real file contents if task specifies files", () => {
    const specPath = path.join(tempDir, ".codeforge", "specs", "auth.md");
    fs.writeFileSync(specPath, "Spec");

    // Create a real source file in the workspace
    fs.mkdirSync(path.join(tempDir, "src"));
    fs.writeFileSync(path.join(tempDir, "src", "index.ts"), "console.log('hello');");

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

    const prompt = buildContextPrompt(tempDir, "auth", task);

    // It should include the contents of the existing file
    expect(prompt).toContain("### File: src/index.ts");
    expect(prompt).toContain("console.log('hello');");

    // It should note the missing file
    expect(prompt).toContain("### File: src/missing.ts");
    expect(prompt).toContain("(File does not exist yet. You will need to create it.)");
  });
});

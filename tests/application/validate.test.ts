import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { validatePlan } from "../../src/application/validate.js";
import { Task } from "../../src/domain/task.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-test-validate-"));
}

function makeWorkspace(tempDir: string): void {
  const root = path.join(tempDir, ".codeforge");
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(root, "tasks", "test-spec"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "metadata.json"),
    JSON.stringify({ initialized: true }),
    "utf-8"
  );
}

function writeTask(tempDir: string, spec: string, task: Partial<Task>, filename?: string) {
  const name = filename || `${task.id}.json`;
  const p = path.join(tempDir, ".codeforge", "tasks", spec, name);
  fs.writeFileSync(p, JSON.stringify(task, null, 2), "utf-8");
}

function validTask(id: string, deps: string[] = []): Task {
  return {
    id,
    title: "Test Task",
    objective: "Test",
    context: "Context",
    implementation: "Impl",
    files: [],
    dependencies: deps,
    constraints: [],
    acceptanceCriteria: []
  };
}

describe("validatePlan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns notInitialized if metadata missing", () => {
    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(result.kind).toBe("not-initialized");
  });

  it("returns specNotFound if tasks dir missing", () => {
    const root = path.join(tempDir, ".codeforge");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "metadata.json"), "{}");

    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(result.kind).toBe("spec-not-found");
  });

  it("fails if no JSON files found", () => {
    makeWorkspace(tempDir);
    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec");
    
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors[0]).toContain("No JSON files found");
    }
  });

  it("fails on invalid JSON syntax", () => {
    makeWorkspace(tempDir);
    const p = path.join(tempDir, ".codeforge", "tasks", "test-spec", "TASK-001.json");
    fs.writeFileSync(p, "{ invalid_json: true }");

    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors[0]).toContain("is not valid JSON");
    }
  });

  it("fails if required fields are missing", () => {
    makeWorkspace(tempDir);
    // Missing title and objective
    writeTask(tempDir, "test-spec", { id: "TASK-001", dependencies: [] });

    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some(e => e.includes("missing required field: \"title\""))).toBe(true);
    }
  });

  it("fails if id inside file does not match filename", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "test-spec", validTask("TASK-002"), "TASK-001.json");

    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some(e => e.includes("does not match filename"))).toBe(true);
    }
  });

  it("fails if a dependency does not exist", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "test-spec", validTask("TASK-001", ["TASK-999"]));

    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some(e => e.includes("depends on nonexistent task"))).toBe(true);
    }
  });

  it("fails on circular dependency (A -> B -> A)", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "test-spec", validTask("TASK-001", ["TASK-002"]));
    writeTask(tempDir, "test-spec", validTask("TASK-002", ["TASK-001"]));

    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some(e => e.includes("Circular dependency detected"))).toBe(true);
    }
  });

  it("fails on self circular dependency (A -> A)", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "test-spec", validTask("TASK-001", ["TASK-001"]));

    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some(e => e.includes("Circular dependency detected"))).toBe(true);
    }
  });

  it("succeeds on valid linear DAG (A -> B -> C)", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "test-spec", validTask("TASK-003", []));
    writeTask(tempDir, "test-spec", validTask("TASK-002", ["TASK-003"]));
    writeTask(tempDir, "test-spec", validTask("TASK-001", ["TASK-002"]));

    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(result.kind).toBe("valid");
  });

  it("succeeds on complex valid DAG", () => {
    makeWorkspace(tempDir);
    /*
        T3   T4
         \   /
           T2
           |
           T1
    */
    writeTask(tempDir, "test-spec", validTask("TASK-004", []));
    writeTask(tempDir, "test-spec", validTask("TASK-003", []));
    writeTask(tempDir, "test-spec", validTask("TASK-002", ["TASK-003", "TASK-004"]));
    writeTask(tempDir, "test-spec", validTask("TASK-001", ["TASK-002"]));

    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec");
    expect(result.kind).toBe("valid");
  });

  it("can validate a single task and skips DAG checks", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "test-spec", validTask("TASK-001", ["TASK-999"])); // TASK-999 is missing, full DAG would fail

    // Validating only TASK-001 skips DAG, so it should be valid
    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec", "TASK-001");
    expect(result.kind).toBe("valid");
  });

  it("returns error if single task file does not exist", () => {
    makeWorkspace(tempDir);
    writeTask(tempDir, "test-spec", validTask("TASK-001"));

    const result = validatePlan(new NodeWorkspaceGateway(tempDir), "test-spec", "TASK-002");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors[0]).toContain("Task file TASK-002.json not found");
    }
  });
});

import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { validatePlan } from "../../src/application/validate.js";
import { Task } from "../../src/domain/task.js";

function makeWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(".codeforge/tasks/test-spec");
  gateway.writeFile(".codeforge/metadata.json", JSON.stringify({ initialized: true }));
}

function writeTask(gateway: InMemoryWorkspaceGateway, spec: string, task: Partial<Task>, filename?: string) {
  const name = filename || `${task.id}.json`;
  gateway.writeFile(`.codeforge/tasks/${spec}/${name}`, JSON.stringify(task, null, 2));
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
  let gateway: InMemoryWorkspaceGateway;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
  });

  it("returns notInitialized if metadata missing", () => {
    const result = validatePlan(gateway, "test-spec");
    expect(result.kind).toBe("not-initialized");
  });

  it("returns specNotFound if tasks dir missing", () => {
    gateway.mkdir(".codeforge");
    gateway.writeFile(".codeforge/metadata.json", "{}");

    const result = validatePlan(gateway, "test-spec");
    expect(result.kind).toBe("spec-not-found");
  });

  it("fails if no JSON files found", () => {
    makeWorkspace(gateway);
    const result = validatePlan(gateway, "test-spec");
    
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors[0]).toContain("No JSON files found");
    }
  });

  it("fails on invalid JSON syntax", () => {
    makeWorkspace(gateway);
    gateway.writeFile(".codeforge/tasks/test-spec/TASK-001.json", "{ invalid_json: true }");

    const result = validatePlan(gateway, "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors[0]).toContain("is not valid JSON");
    }
  });

  it("fails if required fields are missing", () => {
    makeWorkspace(gateway);
    // Missing title and objective
    writeTask(gateway, "test-spec", { id: "TASK-001", dependencies: [] });

    const result = validatePlan(gateway, "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some(e => e.includes("missing required field: \"title\""))).toBe(true);
    }
  });

  it("fails if id inside file does not match filename", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "test-spec", validTask("TASK-002"), "TASK-001.json");

    const result = validatePlan(gateway, "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some(e => e.includes("does not match filename"))).toBe(true);
    }
  });

  it("fails if a dependency does not exist", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "test-spec", validTask("TASK-001", ["TASK-999"]));

    const result = validatePlan(gateway, "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some(e => e.includes("depends on nonexistent task"))).toBe(true);
    }
  });

  it("fails on circular dependency (A -> B -> A)", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "test-spec", validTask("TASK-001", ["TASK-002"]));
    writeTask(gateway, "test-spec", validTask("TASK-002", ["TASK-001"]));

    const result = validatePlan(gateway, "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some(e => e.includes("Circular dependency detected"))).toBe(true);
    }
  });

  it("fails on self circular dependency (A -> A)", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "test-spec", validTask("TASK-001", ["TASK-001"]));

    const result = validatePlan(gateway, "test-spec");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some(e => e.includes("Circular dependency detected"))).toBe(true);
    }
  });

  it("succeeds on valid linear DAG (A -> B -> C)", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "test-spec", validTask("TASK-003", []));
    writeTask(gateway, "test-spec", validTask("TASK-002", ["TASK-003"]));
    writeTask(gateway, "test-spec", validTask("TASK-001", ["TASK-002"]));

    const result = validatePlan(gateway, "test-spec");
    expect(result.kind).toBe("valid");
  });

  it("succeeds on complex valid DAG", () => {
    makeWorkspace(gateway);
    /*
        T3   T4
         \   /
           T2
           |
           T1
    */
    writeTask(gateway, "test-spec", validTask("TASK-004", []));
    writeTask(gateway, "test-spec", validTask("TASK-003", []));
    writeTask(gateway, "test-spec", validTask("TASK-002", ["TASK-003", "TASK-004"]));
    writeTask(gateway, "test-spec", validTask("TASK-001", ["TASK-002"]));

    const result = validatePlan(gateway, "test-spec");
    expect(result.kind).toBe("valid");
  });

  it("can validate a single task and skips DAG checks", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "test-spec", validTask("TASK-001", ["TASK-999"]));

    const result = validatePlan(gateway, "test-spec", "TASK-001");
    expect(result.kind).toBe("valid");
  });

  it("returns error if single task file does not exist", () => {
    makeWorkspace(gateway);
    writeTask(gateway, "test-spec", validTask("TASK-001"));

    const result = validatePlan(gateway, "test-spec", "TASK-002");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors[0]).toContain("Task file TASK-002.json not found");
    }
  });
});

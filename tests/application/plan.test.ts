import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { getAvailableSpecs, preparePlanningPrompt } from "../../src/application/plan.js";

function makeWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(".codeforge/specs");
  gateway.mkdir(".codeforge/rules");
  gateway.writeFile(".codeforge/metadata.json", JSON.stringify({ initialized: true }));
}

describe("getAvailableSpecs", () => {
  let gateway: InMemoryWorkspaceGateway;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
  });

  it("returns empty array if not initialized", () => {
    expect(getAvailableSpecs(gateway)).toEqual([]);
  });

  it("returns only .md files without extension", () => {
    makeWorkspace(gateway);
    
    gateway.writeFile(".codeforge/specs/auth.md", "");
    gateway.writeFile(".codeforge/specs/db.md", "");
    gateway.writeFile(".codeforge/specs/readme.txt", "");

    const specs = getAvailableSpecs(gateway);
    expect(specs).toHaveLength(2);
    expect(specs).toContain("auth");
    expect(specs).toContain("db");
  });
});

describe("preparePlanningPrompt", () => {
  let gateway: InMemoryWorkspaceGateway;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
  });

  it("returns notInitialized if metadata.json is missing", () => {
    const result = preparePlanningPrompt(gateway, "auth");
    expect(result.kind).toBe("not-initialized");
  });

  it("returns specNotFound if spec does not exist", () => {
    makeWorkspace(gateway);
    const result = preparePlanningPrompt(gateway, "missing-spec");
    
    expect(result.kind).toBe("spec-not-found");
  });

  it("generates the prompt correctly and creates tasks folder", () => {
    makeWorkspace(gateway);
    
    gateway.writeFile(".codeforge/rules/planning.md", "PLANNING RULES");
    gateway.writeFile(".codeforge/specs/auth.md", "AUTH SPEC");

    const result = preparePlanningPrompt(gateway, "auth");

    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.prompt).toContain("SYSTEM PROMPT FOR AI AGENT");
      expect(result.prompt).toContain("--- SPEC: auth ---");
      expect(result.prompt).toContain("--- RULES ---");
      expect(result.prompt).toContain(".codeforge/tasks/auth");
    }

    // Verifies tasks directory was created
    expect(gateway.exists(".codeforge/tasks/auth")).toBe(true);
  });
});

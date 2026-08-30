import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { describe, it, expect, beforeEach } from "vitest";
import { createSpec } from "../../src/application/create-spec.js";

function makeInitializedWorkspace(gateway: InMemoryWorkspaceGateway): void {
  gateway.mkdir(".codeforge");
  gateway.mkdir(".codeforge/specs");
  gateway.writeFile(
    ".codeforge/metadata.json",
    JSON.stringify({ initialized: true, version: "1.0", initializedAt: new Date().toISOString() })
  );
}

describe("createSpec", () => {
  let gateway: InMemoryWorkspaceGateway;

  beforeEach(() => {
    gateway = new InMemoryWorkspaceGateway();
  });

  it("returns notInitialized: true when .codeforge/metadata.json is missing", () => {
    const result = createSpec(gateway, "User Authentication");
    expect(result.kind).toBe("not-initialized");
  });

  it("creates the spec file successfully with expected template", () => {
    makeInitializedWorkspace(gateway);

    const result = createSpec(gateway, "User Authentication");

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(gateway.exists(result.filePath)).toBe(true);
      
      const content = gateway.readFile(result.filePath);
      expect(content).toContain("# User Authentication");
      expect(content).toContain("## Objective");
      expect(content).toContain("## Functional Requirements");
    }
  });

  it("returns alreadyExists: true when spec already exists", () => {
    makeInitializedWorkspace(gateway);
    createSpec(gateway, "User Authentication");

    const result = createSpec(gateway, "User Authentication");

    expect(result.kind).toBe("already-exists");
  });

  it("does not overwrite existing spec file", () => {
    makeInitializedWorkspace(gateway);
    const resultFirst = createSpec(gateway, "User Authentication");
    
    if (resultFirst.kind === "created") {
      gateway.writeFile(resultFirst.filePath, "# my custom content\n");
    }

    createSpec(gateway, "User Authentication");

    if (resultFirst.kind === "created") {
      const contentAfter = gateway.readFile(resultFirst.filePath);
      expect(contentAfter).toBe("# my custom content\n");
    }
  });
});

import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createSpec } from "../../src/application/create-spec.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-test-"));
}

function makeInitializedWorkspace(tempDir: string): void {
  const root = path.join(tempDir, ".codeforge");
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(root, "specs"));
  fs.writeFileSync(
    path.join(root, "metadata.json"),
    JSON.stringify({ initialized: true, version: "1.0", initializedAt: new Date().toISOString() }),
    "utf-8"
  );
}

describe("createSpec", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns notInitialized: true when .codeforge/metadata.json is missing", () => {
    const result = createSpec(new NodeWorkspaceGateway(tempDir), "User Authentication");

    expect(result.kind).toBe("not-initialized");
  });

  it("creates the spec file successfully", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(new NodeWorkspaceGateway(tempDir), "User Authentication");

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(fs.existsSync(path.join(tempDir, result.filePath))).toBe(true);
    }
  });

  it("creates the file inside .codeforge/specs/", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(new NodeWorkspaceGateway(tempDir), "User Authentication");

    const expectedDir = ".codeforge/specs";
    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.filePath.startsWith(expectedDir)).toBe(true);
    }
  });

  it("converts name to kebab-case slug as filename", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(new NodeWorkspaceGateway(tempDir), "User Authentication");

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.filePath).toMatch(/user-authentication\.md$/);
    }
  });

  it("lowercases the filename slug", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(new NodeWorkspaceGateway(tempDir), "REFRESH TOKEN");

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.filePath).toMatch(/refresh-token\.md$/);
    }
  });

  it("writes a template with the spec name as heading", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(new NodeWorkspaceGateway(tempDir), "Refresh Token");

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      const content = fs.readFileSync(path.join(tempDir, result.filePath), "utf-8");
      expect(content).toContain("# Refresh Token");
    }
  });

  it("template contains all expected sections", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(new NodeWorkspaceGateway(tempDir), "Refresh Token");

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      const content = fs.readFileSync(path.join(tempDir, result.filePath), "utf-8");
      expect(content).toContain("## Objective");
      expect(content).toContain("## Functional Requirements");
      expect(content).toContain("## Non-Functional Requirements");
      expect(content).toContain("## Flow");
      expect(content).toContain("## Acceptance Criteria");
      expect(content).toContain("## Endpoints");
      expect(content).toContain("## Architecture");
      expect(content).toContain("## Technologies");
    }
  });

  it("returns alreadyExists: true when spec already exists", () => {
    makeInitializedWorkspace(tempDir);
    createSpec(new NodeWorkspaceGateway(tempDir), "User Authentication");

    const result = createSpec(new NodeWorkspaceGateway(tempDir), "User Authentication");

    expect(result.kind).toBe("already-exists");
  });

  it("does not overwrite existing spec file", () => {
    makeInitializedWorkspace(tempDir);
    createSpec(new NodeWorkspaceGateway(tempDir), "User Authentication");

    const filePath = path.join(tempDir, ".codeforge", "specs", "user-authentication.md");
    fs.writeFileSync(filePath, "# my custom content\n", "utf-8");

    createSpec(new NodeWorkspaceGateway(tempDir), "User Authentication");

    const contentAfter = fs.readFileSync(filePath, "utf-8");
    expect(contentAfter).toBe("# my custom content\n");
  });

  it("returns the correct filePath on success", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(new NodeWorkspaceGateway(tempDir), "Create Producer");
    const expected = ".codeforge/specs/create-producer.md";

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.filePath).toBe(expected);
    }
  });
});

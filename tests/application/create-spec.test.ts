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
    const result = createSpec(tempDir, "User Authentication");

    expect(result.notInitialized).toBe(true);
    expect(result.alreadyExists).toBe(false);
    expect(result.filePath).toBe("");
  });

  it("creates the spec file successfully", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(tempDir, "User Authentication");

    expect(result.notInitialized).toBe(false);
    expect(result.alreadyExists).toBe(false);
    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it("creates the file inside .codeforge/specs/", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(tempDir, "User Authentication");

    const expectedDir = path.join(tempDir, ".codeforge", "specs");
    expect(result.filePath.startsWith(expectedDir)).toBe(true);
  });

  it("converts name to kebab-case slug as filename", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(tempDir, "User Authentication");

    expect(result.filePath).toMatch(/user-authentication\.md$/);
  });

  it("lowercases the filename slug", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(tempDir, "REFRESH TOKEN");

    expect(result.filePath).toMatch(/refresh-token\.md$/);
  });

  it("writes a template with the spec name as heading", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(tempDir, "Refresh Token");
    const content = fs.readFileSync(result.filePath, "utf-8");

    expect(content).toContain("# Refresh Token");
  });

  it("template contains all expected sections", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(tempDir, "Refresh Token");
    const content = fs.readFileSync(result.filePath, "utf-8");

    expect(content).toContain("## Objective");
    expect(content).toContain("## Functional Requirements");
    expect(content).toContain("## Non-Functional Requirements");
    expect(content).toContain("## Flow");
    expect(content).toContain("## Acceptance Criteria");
    expect(content).toContain("## Endpoints");
    expect(content).toContain("## Architecture");
    expect(content).toContain("## Technologies");
  });

  it("returns alreadyExists: true when spec already exists", () => {
    makeInitializedWorkspace(tempDir);
    createSpec(tempDir, "User Authentication");

    const result = createSpec(tempDir, "User Authentication");

    expect(result.alreadyExists).toBe(true);
    expect(result.notInitialized).toBe(false);
  });

  it("does not overwrite existing spec file", () => {
    makeInitializedWorkspace(tempDir);
    createSpec(tempDir, "User Authentication");

    const filePath = path.join(tempDir, ".codeforge", "specs", "user-authentication.md");
    fs.writeFileSync(filePath, "# my custom content\n", "utf-8");

    createSpec(tempDir, "User Authentication");

    const contentAfter = fs.readFileSync(filePath, "utf-8");
    expect(contentAfter).toBe("# my custom content\n");
  });

  it("returns the correct filePath on success", () => {
    makeInitializedWorkspace(tempDir);

    const result = createSpec(tempDir, "Create Producer");
    const expected = path.join(tempDir, ".codeforge", "specs", "create-producer.md");

    expect(result.filePath).toBe(expected);
  });
});

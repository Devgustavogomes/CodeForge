import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getAvailableSpecs, preparePlanningPrompt } from "../../src/application/plan.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-test-plan-"));
}

function makeWorkspace(tempDir: string): void {
  const root = path.join(tempDir, ".codeforge");
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(root, "specs"));
  fs.mkdirSync(path.join(root, "rules"));
  fs.writeFileSync(
    path.join(root, "metadata.json"),
    JSON.stringify({ initialized: true }),
    "utf-8"
  );
}

describe("getAvailableSpecs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty array if not initialized", () => {
    expect(getAvailableSpecs(tempDir)).toEqual([]);
  });

  it("returns only .md files without extension", () => {
    makeWorkspace(tempDir);
    
    fs.writeFileSync(path.join(tempDir, ".codeforge", "specs", "auth.md"), "");
    fs.writeFileSync(path.join(tempDir, ".codeforge", "specs", "db.md"), "");
    fs.writeFileSync(path.join(tempDir, ".codeforge", "specs", "readme.txt"), "");

    const specs = getAvailableSpecs(tempDir);
    expect(specs).toHaveLength(2);
    expect(specs).toContain("auth");
    expect(specs).toContain("db");
  });
});

describe("preparePlanningPrompt", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns notInitialized if metadata.json is missing", () => {
    const result = preparePlanningPrompt(tempDir, "auth");
    expect(result.notInitialized).toBe(true);
    expect(result.prompt).toBe("");
  });

  it("returns specNotFound if spec does not exist", () => {
    makeWorkspace(tempDir);
    const result = preparePlanningPrompt(tempDir, "missing-spec");
    
    expect(result.notInitialized).toBe(false);
    expect(result.specNotFound).toBe(true);
    expect(result.prompt).toBe("");
  });

  it("generates the prompt correctly and creates tasks folder", () => {
    makeWorkspace(tempDir);
    
    fs.writeFileSync(
      path.join(tempDir, ".codeforge", "rules", "planning.md"), 
      "PLANNING RULES", 
      "utf-8"
    );
    
    fs.writeFileSync(
      path.join(tempDir, ".codeforge", "specs", "auth.md"), 
      "AUTH SPEC", 
      "utf-8"
    );

    const result = preparePlanningPrompt(tempDir, "auth");

    expect(result.notInitialized).toBe(false);
    expect(result.specNotFound).toBe(false);

    expect(result.prompt).toContain("SYSTEM PROMPT FOR AI AGENT");
    expect(result.prompt).toContain("PLANNING RULES");
    expect(result.prompt).toContain("AUTH SPEC");
    expect(result.prompt).toContain(".codeforge/tasks/auth/");

    // Verifies tasks directory was created
    expect(fs.existsSync(path.join(tempDir, ".codeforge", "tasks", "auth"))).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { initializeWorkspace } from "../../src/application/initialize-workspace.js";

const REAL_RULES_DIR = path.join(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "src",
  "rules"
);

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-test-"));
}

function makeFakeRulesDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-rules-"));
  fs.writeFileSync(path.join(dir, "planning.md"), "# Planning Rules\n", "utf-8");
  return dir;
}

describe("initializeWorkspace", () => {
  let tempDir: string;
  let fakeRulesDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    fakeRulesDir = makeFakeRulesDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(fakeRulesDir, { recursive: true, force: true });
  });

  it("creates the .codeforge directory structure", () => {
    initializeWorkspace(tempDir, fakeRulesDir);

    const root = path.join(tempDir, ".codeforge");
    expect(fs.existsSync(root)).toBe(true);
    expect(fs.statSync(root).isDirectory()).toBe(true);
  });

  it("creates all expected subdirectories (no plans/)", () => {
    initializeWorkspace(tempDir, fakeRulesDir);

    const subdirs = ["specs", "tasks", "executions", "rules"];
    for (const sub of subdirs) {
      const dirPath = path.join(tempDir, ".codeforge", sub);
      expect(fs.existsSync(dirPath), `missing: .codeforge/${sub}`).toBe(true);
      expect(fs.statSync(dirPath).isDirectory()).toBe(true);
    }

    const plansDir = path.join(tempDir, ".codeforge", "plans");
    expect(fs.existsSync(plansDir), "plans/ should not be created").toBe(false);
  });

  it("creates config.yaml", () => {
    initializeWorkspace(tempDir, fakeRulesDir);

    const configPath = path.join(tempDir, ".codeforge", "config.yaml");
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it("copies all files from rulesSourceDir into .codeforge/rules/", () => {
    initializeWorkspace(tempDir, fakeRulesDir);

    const planningPath = path.join(tempDir, ".codeforge", "rules", "planning.md");
    expect(fs.existsSync(planningPath)).toBe(true);
  });

  it("planning.md contains the expected sections (real rules file)", () => {
    initializeWorkspace(tempDir, REAL_RULES_DIR);

    const planningPath = path.join(tempDir, ".codeforge", "rules", "planning.md");
    const content = fs.readFileSync(planningPath, "utf-8");

    expect(content).toContain("# CodeForge — Planning Rules");
    expect(content).toContain("## Task format");
    expect(content).toContain("## Rules for decomposition");
    expect(content).toContain("## Rules for dependencies");
    expect(content).toContain("## Output format");
    expect(content).toContain("## What you must NOT do");
  });

  it("creates metadata.json with initialized: true", () => {
    initializeWorkspace(tempDir, fakeRulesDir);

    const metadataPath = path.join(tempDir, ".codeforge", "metadata.json");
    expect(fs.existsSync(metadataPath)).toBe(true);

    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    expect(metadata.initialized).toBe(true);
    expect(metadata.version).toBe("1.0");
    expect(typeof metadata.initializedAt).toBe("string");
  });

  it("returns the list of created entries", () => {
    const result = initializeWorkspace(tempDir, fakeRulesDir);

    expect(result.alreadyInitialized).toBe(false);
    expect(result.created).toContain(".codeforge/");
    expect(result.created).toContain(".codeforge/config.yaml");
    expect(result.created).toContain(".codeforge/rules/planning.md");
    expect(result.created).toContain(".codeforge/metadata.json");

    const subdirs = ["specs", "tasks", "executions", "rules"];
    for (const sub of subdirs) {
      expect(result.created).toContain(`.codeforge/${sub}/`);
    }

    expect(result.created).not.toContain(".codeforge/plans/");
  });

  it("returns alreadyInitialized: true on second run", () => {
    initializeWorkspace(tempDir, fakeRulesDir);
    const result = initializeWorkspace(tempDir, fakeRulesDir);

    expect(result.alreadyInitialized).toBe(true);
    expect(result.created).toHaveLength(0);
  });

  it("does not overwrite existing files on second run", () => {
    initializeWorkspace(tempDir, fakeRulesDir);

    const configPath = path.join(tempDir, ".codeforge", "config.yaml");
    const originalContent = fs.readFileSync(configPath, "utf-8");
    fs.writeFileSync(configPath, "# modified by user\n", "utf-8");

    initializeWorkspace(tempDir, fakeRulesDir);

    const contentAfter = fs.readFileSync(configPath, "utf-8");
    expect(contentAfter).toBe("# modified by user\n");
    expect(contentAfter).not.toBe(originalContent);
  });

  it("metadata.json is written last (atomicity signal)", () => {
    const root = path.join(tempDir, ".codeforge");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "config.yaml"), "# partial\n", "utf-8");

    const result = initializeWorkspace(tempDir, fakeRulesDir);
    expect(result.alreadyInitialized).toBe(false);

    const metadataPath = path.join(root, "metadata.json");
    expect(fs.existsSync(metadataPath)).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initializeWorkspace } from "../../src/application/initialize-workspace.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codeforge-test-"));
}

describe("initializeWorkspace", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates the .codeforge directory structure", () => {
    initializeWorkspace(tempDir);

    const root = path.join(tempDir, ".codeforge");
    expect(fs.existsSync(root)).toBe(true);
    expect(fs.statSync(root).isDirectory()).toBe(true);
  });

  it("creates all expected subdirectories", () => {
    initializeWorkspace(tempDir);

    const subdirs = ["specs", "plans", "tasks", "executions", "rules"];
    for (const sub of subdirs) {
      const dirPath = path.join(tempDir, ".codeforge", sub);
      expect(fs.existsSync(dirPath), `missing: .codeforge/${sub}`).toBe(true);
      expect(fs.statSync(dirPath).isDirectory()).toBe(true);
    }
  });

  it("creates config.yaml", () => {
    initializeWorkspace(tempDir);

    const configPath = path.join(tempDir, ".codeforge", "config.yaml");
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it("creates metadata.json with initialized: true", () => {
    initializeWorkspace(tempDir);

    const metadataPath = path.join(tempDir, ".codeforge", "metadata.json");
    expect(fs.existsSync(metadataPath)).toBe(true);

    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    expect(metadata.initialized).toBe(true);
    expect(metadata.version).toBe("1.0");
    expect(typeof metadata.initializedAt).toBe("string");
  });

  it("returns the list of created entries", () => {
    const result = initializeWorkspace(tempDir);

    expect(result.alreadyInitialized).toBe(false);
    expect(result.created).toContain(".codeforge/");
    expect(result.created).toContain(".codeforge/config.yaml");
    expect(result.created).toContain(".codeforge/metadata.json");

    const subdirs = ["specs", "plans", "tasks", "executions", "rules"];
    for (const sub of subdirs) {
      expect(result.created).toContain(`.codeforge/${sub}/`);
    }
  });

  it("returns alreadyInitialized: true on second run", () => {
    initializeWorkspace(tempDir);
    const result = initializeWorkspace(tempDir);

    expect(result.alreadyInitialized).toBe(true);
    expect(result.created).toHaveLength(0);
  });

  it("does not overwrite existing files on second run", () => {
    initializeWorkspace(tempDir);

    const configPath = path.join(tempDir, ".codeforge", "config.yaml");
    const originalContent = fs.readFileSync(configPath, "utf-8");
    fs.writeFileSync(configPath, "# modified by user\n", "utf-8");

    initializeWorkspace(tempDir);

    const contentAfter = fs.readFileSync(configPath, "utf-8");
    expect(contentAfter).toBe("# modified by user\n");
    expect(contentAfter).not.toBe(originalContent);
  });

  it("metadata.json is written last (atomicity signal)", () => {
    // Simulates an interrupted init: .codeforge exists but metadata.json does not
    const root = path.join(tempDir, ".codeforge");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "config.yaml"), "# partial\n", "utf-8");

    // Should NOT treat this as already initialized
    const result = initializeWorkspace(tempDir);
    expect(result.alreadyInitialized).toBe(false);

    // Should complete and write metadata.json
    const metadataPath = path.join(root, "metadata.json");
    expect(fs.existsSync(metadataPath)).toBe(true);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { SpecSourceFactory } from "../../src/infrastructure/spec-sources/SpecSourceFactory.js";
import { FilesystemSpecSource } from "../../src/infrastructure/spec-sources/FilesystemSpecSource.js";
import { LinearSpecSource } from "../../src/infrastructure/spec-sources/LinearSpecSource.js";
import { GitHubSpecSource } from "../../src/infrastructure/spec-sources/GitHubSpecSource.js";
import { ClickUpSpecSource } from "../../src/infrastructure/spec-sources/ClickUpSpecSource.js";
import { SpecSource } from "../../src/application/ports/SpecSource.js";
import { FetchedSpec, SpecReference } from "../../src/domain/spec-source.js";
import {
  PullSpecUseCase,
  sanitizeFilename,
  formatSpecMarkdown,
} from "../../src/application/use-cases/PullSpecUseCase.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { Command } from "commander";
import { translate } from "../../src/cli/ui/i18n.js";
import { getMenuGroups } from "../../src/cli/menu/registry.js";
import { registerSpecPullCommand } from "../../src/cli/commands/spec/pull.js";

class MockSpecSource implements SpecSource {
  readonly name: string;
  public specs = new Map<string, FetchedSpec>();
  public shouldFail = false;
  public failureMessage = "Network connection failed";

  constructor(name = "mock-source") {
    this.name = name;
  }

  async list(): Promise<SpecReference[]> {
    return Array.from(this.specs.values()).map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
    }));
  }

  async fetch(id: string): Promise<FetchedSpec> {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }
    const spec = this.specs.get(id);
    if (!spec) {
      throw new Error(`Spec "${id}" not found on ${this.name}.`);
    }
    return spec;
  }
}

function initWorkspace(gw: InMemoryWorkspaceGateway): void {
  gw.mkdir(".codeforge");
  gw.mkdir(".codeforge/specs");
  gw.writeFile(
    ".codeforge/metadata.json",
    JSON.stringify({
      initialized: true,
      version: "1.0",
      initializedAt: new Date().toISOString(),
    })
  );
}

describe("SpecSourceFactory", () => {
  it("returns available providers", () => {
    expect(SpecSourceFactory.getAvailableProviders()).toEqual([
      "filesystem",
      "linear",
      "github",
      "clickup",
    ]);
  });

  it("creates supported providers", () => {
    expect(SpecSourceFactory.create("filesystem")).toBeInstanceOf(FilesystemSpecSource);
    expect(SpecSourceFactory.create("linear")).toBeInstanceOf(LinearSpecSource);
    expect(SpecSourceFactory.create("github")).toBeInstanceOf(GitHubSpecSource);
    expect(SpecSourceFactory.create("clickup")).toBeInstanceOf(ClickUpSpecSource);
  });

  it("handles case-insensitive provider names", () => {
    expect(SpecSourceFactory.create("FILESYSTEM")).toBeInstanceOf(FilesystemSpecSource);
    expect(SpecSourceFactory.create("Linear")).toBeInstanceOf(LinearSpecSource);
    expect(SpecSourceFactory.create("GITHUB")).toBeInstanceOf(GitHubSpecSource);
    expect(SpecSourceFactory.create("ClickUp")).toBeInstanceOf(ClickUpSpecSource);
  });

  it("throws for unsupported provider", () => {
    expect(() => SpecSourceFactory.create("jira")).toThrow(
      /Unsupported spec source provider: jira/
    );
  });
});

describe("sanitizeFilename", () => {
  it("converts uppercase to lowercase", () => {
    expect(sanitizeFilename("ENG-123")).toBe("eng-123");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeFilename("User Login Flow")).toBe("user-login-flow");
  });

  it("removes invalid path characters", () => {
    expect(sanitizeFilename("feature: test / path? *")).toBe("feature-test-path");
  });

  it("strips trailing .md extension", () => {
    expect(sanitizeFilename("my-feature.md")).toBe("my-feature");
    expect(sanitizeFilename("MY-FEATURE.MD")).toBe("my-feature");
  });

  it("trims hyphens at ends", () => {
    expect(sanitizeFilename("--my-feature--")).toBe("my-feature");
  });
});

describe("formatSpecMarkdown", () => {
  it("formats markdown with all fields", () => {
    const spec: FetchedSpec = {
      id: "ENG-101",
      title: "OAuth Authentication",
      description: "Implement OAuth with Google and GitHub.",
      url: "https://linear.app/issue/ENG-101",
    };

    const formatted = formatSpecMarkdown("linear", spec);
    expect(formatted).toBe(
      "# [ENG-101] OAuth Authentication\n\n" +
        "> **Source:** linear | **URL:** https://linear.app/issue/ENG-101\n\n" +
        "## Description\n\n" +
        "Implement OAuth with Google and GitHub.\n"
    );
  });

  it("handles missing URL with N/A fallback", () => {
    const spec: FetchedSpec = {
      id: "SPEC-1",
      title: "Local Feature",
      description: "Feature without remote URL.",
    };

    const formatted = formatSpecMarkdown("filesystem", spec);
    expect(formatted).toContain("> **Source:** filesystem | **URL:** N/A");
  });
});

describe("PullSpecUseCase", () => {
  let gw: InMemoryWorkspaceGateway;
  let mockSource: MockSpecSource;

  beforeEach(() => {
    gw = new InMemoryWorkspaceGateway();
    mockSource = new MockSpecSource("linear");
    mockSource.specs.set("ENG-100", {
      id: "ENG-100",
      title: "Add User Registration",
      description: "Users should be able to register with email and password.",
      url: "https://linear.app/issue/ENG-100",
    });
  });

  it("returns not-initialized if workspace is not initialized", async () => {
    const useCase = new PullSpecUseCase(gw, mockSource);
    const result = await useCase.execute({ id: "ENG-100" });

    expect(result.kind).toBe("not-initialized");
  });

  it("returns error if no SpecSource is provided", async () => {
    initWorkspace(gw);
    const useCase = new PullSpecUseCase(gw);
    const result = await useCase.execute({ id: "ENG-100" });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toContain("No SpecSource configured or provided");
    }
  });

  it("returns fetch-failed when SpecSource.fetch throws", async () => {
    initWorkspace(gw);
    mockSource.shouldFail = true;
    mockSource.failureMessage = "API rate limit exceeded";

    const useCase = new PullSpecUseCase(gw, mockSource);
    const result = await useCase.execute({ id: "ENG-100" });

    expect(result.kind).toBe("fetch-failed");
    if (result.kind === "fetch-failed") {
      expect(result.error).toBe("API rate limit exceeded");
    }
  });

  it("returns fetch-failed when spec is not found", async () => {
    initWorkspace(gw);
    const useCase = new PullSpecUseCase(gw, mockSource);
    const result = await useCase.execute({ id: "ENG-999" });

    expect(result.kind).toBe("fetch-failed");
    if (result.kind === "fetch-failed") {
      expect(result.error).toContain('Spec "ENG-999" not found');
    }
  });

  it("successfully fetches spec and writes standardized Markdown to .codeforge/specs/<filename>.md", async () => {
    initWorkspace(gw);
    const useCase = new PullSpecUseCase(gw, mockSource);

    const result = await useCase.execute({ id: "ENG-100" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("eng-100");
      expect(result.filePath).toBe(".codeforge/specs/eng-100.md");
      expect(result.overwritten).toBe(false);
      expect(result.spec.id).toBe("ENG-100");

      expect(gw.exists(".codeforge/specs/eng-100.md")).toBe(true);
      const written = gw.readFile(".codeforge/specs/eng-100.md");
      expect(written).toContain("# [ENG-100] Add User Registration");
      expect(written).toContain("> **Source:** linear | **URL:** https://linear.app/issue/ENG-100");
      expect(written).toContain("## Description");
      expect(written).toContain("Users should be able to register with email and password.");
    }
  });

  it("supports custom filename (--name) option", async () => {
    initWorkspace(gw);
    const useCase = new PullSpecUseCase(gw, mockSource);

    const result = await useCase.execute({
      id: "ENG-100",
      customName: "user-signup-flow",
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("user-signup-flow");
      expect(result.filePath).toBe(".codeforge/specs/user-signup-flow.md");
      expect(gw.exists(".codeforge/specs/user-signup-flow.md")).toBe(true);
      expect(gw.exists(".codeforge/specs/eng-100.md")).toBe(false);
    }
  });

  it("sanitizes custom filename with uppercase and spaces", async () => {
    initWorkspace(gw);
    const useCase = new PullSpecUseCase(gw, mockSource);

    const result = await useCase.execute({
      id: "ENG-100",
      customName: "User Signup Flow!",
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.filename).toBe("user-signup-flow");
      expect(result.filePath).toBe(".codeforge/specs/user-signup-flow.md");
      expect(gw.exists(".codeforge/specs/user-signup-flow.md")).toBe(true);
    }
  });

  it("overwrites existing spec file cleanly and idempotently", async () => {
    initWorkspace(gw);
    const useCase = new PullSpecUseCase(gw, mockSource);

    // Initial write with old contents
    gw.writeFile(
      ".codeforge/specs/eng-100.md",
      "# Old Spec\n\nOld content that should be replaced completely."
    );

    const result = await useCase.execute({ id: "ENG-100" });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.overwritten).toBe(true);
      const content = gw.readFile(".codeforge/specs/eng-100.md");
      expect(content).not.toContain("Old Spec");
      expect(content).not.toContain("Old content that should be replaced completely.");
      expect(content).toContain("# [ENG-100] Add User Registration");
    }
  });

  it("accepts SpecSource passed via execute options overriding constructor", async () => {
    initWorkspace(gw);
    const defaultSource = new MockSpecSource("default");
    const customSource = new MockSpecSource("custom-override");
    customSource.specs.set("ENG-100", {
      id: "ENG-100",
      title: "Override Title",
      description: "From custom override source.",
      url: "https://custom.app/100",
    });

    const useCase = new PullSpecUseCase(gw, defaultSource);
    const result = await useCase.execute({
      id: "ENG-100",
      specSource: customSource,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.content).toContain("> **Source:** custom-override");
      expect(result.content).toContain("# [ENG-100] Override Title");
    }
  });

  it("creates specs directory if it does not exist", async () => {
    // Workspace has metadata.json but no specs/ folder
    gw.mkdir(".codeforge");
    gw.writeFile(
      ".codeforge/metadata.json",
      JSON.stringify({ initialized: true, version: "1.0" })
    );

    const useCase = new PullSpecUseCase(gw, mockSource);
    const result = await useCase.execute({ id: "ENG-100" });

    expect(result.kind).toBe("success");
    expect(gw.exists(".codeforge/specs")).toBe(true);
    expect(gw.exists(".codeforge/specs/eng-100.md")).toBe(true);
  });
});

describe("Spec Pull i18n Translations", () => {
  const keys = [
    "menu_spec_pull",
    "spec_pull_select_item",
    "spec_pull_enter_id",
    "spec_pull_manual_input_option",
    "spec_pull_filesystem_notice",
    "spec_pull_fetching",
    "spec_pull_success",
    "spec_pull_failed",
  ] as const;

  const languages = ["en", "pt", "es"] as const;

  it("provides translations for all spec pull keys in en, pt, and es", () => {
    for (const lang of languages) {
      for (const key of keys) {
        const text = translate(key, lang);
        expect(text).toBeDefined();
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toBe(key);
      }
    }
  });

  it("formats parametrized translations properly in all languages", () => {
    for (const lang of languages) {
      const fetching = translate("spec_pull_fetching", lang, { id: "ENG-1", source: "linear" });
      expect(fetching).toContain("ENG-1");
      expect(fetching).toContain("linear");

      const success = translate("spec_pull_success", lang, { id: "ENG-1", path: ".codeforge/specs/eng-1.md" });
      expect(success).toContain("ENG-1");
      expect(success).toContain(".codeforge/specs/eng-1.md");

      const failed = translate("spec_pull_failed", lang, { error: "Network timeout" });
      expect(failed).toContain("Network timeout");
    }
  });
});

describe("Menu Registry Integration", () => {
  it("includes spec pull option under spec menu group for en, pt, and es", () => {
    for (const lang of ["en", "pt", "es"] as const) {
      const groups = getMenuGroups(lang);
      const specGroup = groups.find((g) => g.id === "spec");
      expect(specGroup).toBeDefined();
      expect(specGroup?.items).toBeDefined();

      const pullItem = specGroup?.items?.find((i) => i.value === "spec pull");
      expect(pullItem).toBeDefined();
      expect(pullItem?.action).toEqual({ type: "command", args: ["spec", "pull"] });
      expect(pullItem?.name).toBe(translate("menu_spec_pull", lang));
    }
  });
});

describe("registerSpecPullCommand", () => {
  it("registers spec pull command with description, arguments, and options", () => {
    const program = new Command();
    const spec = program.command("spec");
    registerSpecPullCommand(spec);

    const pullCmd = spec.commands.find((c) => c.name() === "pull");
    expect(pullCmd).toBeDefined();
    expect(pullCmd?.description()).toContain("Pull a specification");

    // Check arguments
    expect(pullCmd?.registeredArguments.some((arg) => arg.name() === "id")).toBe(true);

    // Check options
    const sourceOpt = pullCmd?.options.find((opt) => opt.long === "--source");
    expect(sourceOpt).toBeDefined();
    expect(sourceOpt?.short).toBe("-s");

    const nameOpt = pullCmd?.options.find((opt) => opt.long === "--name");
    expect(nameOpt).toBeDefined();
    expect(nameOpt?.short).toBe("-n");
  });
});

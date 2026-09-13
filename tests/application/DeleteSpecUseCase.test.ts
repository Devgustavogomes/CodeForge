import { beforeEach, describe, expect, it } from "vitest";
import { DeleteSpecUseCase } from "../../src/application/use-cases/DeleteSpecUseCase.js";
import { DocsManifest } from "../../src/domain/doc.js";
import { PATHS } from "../../src/infrastructure/paths.js";
import { DocsManifestRepository } from "../../src/infrastructure/repositories/DocsManifestRepository.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";

describe("DeleteSpecUseCase", () => {
  let workspace: InMemoryWorkspaceGateway;
  let manifestRepository: DocsManifestRepository;
  let useCase: DeleteSpecUseCase;

  beforeEach(() => {
    workspace = new InMemoryWorkspaceGateway();
    manifestRepository = new DocsManifestRepository(workspace);
    useCase = new DeleteSpecUseCase(workspace, manifestRepository);
  });

  function initializeWorkspace(): void {
    workspace.mkdir(".codeforge");
    workspace.mkdir(PATHS.specsDir);
    workspace.mkdir(PATHS.tasksDir);
    workspace.mkdir(PATHS.executionsDir);
    workspace.mkdir(PATHS.docsDir);
    workspace.writeFile(PATHS.metadata, JSON.stringify({ initialized: true }));
  }

  function writeManifest(manifest: DocsManifest): void {
    manifestRepository.save(manifest);
  }

  it("returns not-initialized without changing workspace state", () => {
    workspace.writeFile(PATHS.specFile("auth"), "# Auth");
    workspace.writeFile(`${PATHS.tasksDir}/auth/TASK-001.json`, "task");
    const filesBefore = new Map(workspace.files);
    const directoriesBefore = new Set(workspace.directories);

    const result = useCase.execute("auth");

    expect(result).toEqual({ kind: "not-initialized" });
    expect(workspace.files).toEqual(filesBefore);
    expect(workspace.directories).toEqual(directoriesBefore);
  });

  it("returns spec-not-found without deleting orphaned or unrelated data", () => {
    initializeWorkspace();
    workspace.writeFile(`${PATHS.tasksDir}/missing/TASK-001.json`, "orphan task");
    workspace.writeFile(PATHS.executionState("missing"), "orphan execution");
    workspace.writeFile(`${PATHS.plansDir}/missing.temp.prompt.md`, "orphan prompt");
    workspace.writeFile(PATHS.specFile("other"), "# Other");
    writeManifest({
      version: "1.0",
      documents: {
        guide: {
          path: `${PATHS.docsDir}/guide.md`,
          specs: [PATHS.specFile("missing"), PATHS.specFile("other")],
          scope: ["src/**"],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      },
    });
    const filesBefore = new Map(workspace.files);
    const directoriesBefore = new Set(workspace.directories);

    const result = useCase.execute("missing");

    expect(result).toEqual({ kind: "spec-not-found" });
    expect(workspace.files).toEqual(filesBefore);
    expect(workspace.directories).toEqual(directoriesBefore);
  });

  it("deletes the specification and all required cascade artifacts", () => {
    initializeWorkspace();
    workspace.writeFile(PATHS.specFile("auth"), "# Auth");
    workspace.writeFile(`${PATHS.tasksDir}/auth/TASK-001.json`, "task one");
    workspace.writeFile(`${PATHS.tasksDir}/auth/nested/TASK-002.json`, "task two");
    workspace.writeFile(PATHS.executionState("auth"), "execution");
    workspace.writeFile(`${PATHS.plansDir}/auth.temp.prompt.md`, "prompt");
    writeManifest({ version: "1.0", documents: {} });

    const result = useCase.execute("auth");

    expect(result).toEqual({ kind: "deleted", specName: "auth" });
    expect(workspace.exists(PATHS.specFile("auth"))).toBe(false);
    expect(workspace.exists(`${PATHS.tasksDir}/auth`)).toBe(false);
    expect(workspace.exists(PATHS.executionState("auth"))).toBe(false);
    expect(workspace.exists(`${PATHS.plansDir}/auth.temp.prompt.md`)).toBe(false);
  });

  it("deletes every matching plan prompt and preserves non-matching plan artifacts", () => {
    initializeWorkspace();
    workspace.writeFile(PATHS.specFile("auth"), "# Auth");
    workspace.writeFile(`${PATHS.plansDir}/auth.temp.prompt.md`, "first");
    workspace.writeFile(`${PATHS.plansDir}/auth.retry.prompt.md`, "second");
    workspace.writeFile(`${PATHS.plansDir}/auth.notes.md`, "third");
    workspace.writeFile(`${PATHS.plansDir}/auth.md`, "not a match");
    workspace.writeFile(`${PATHS.plansDir}/auth.temp.prompt.txt`, "not markdown");
    workspace.writeFile(`${PATHS.plansDir}/authentication.temp.prompt.md`, "other spec");
    writeManifest({ version: "1.0", documents: {} });

    useCase.execute("auth");

    expect(workspace.exists(`${PATHS.plansDir}/auth.temp.prompt.md`)).toBe(false);
    expect(workspace.exists(`${PATHS.plansDir}/auth.retry.prompt.md`)).toBe(false);
    expect(workspace.exists(`${PATHS.plansDir}/auth.notes.md`)).toBe(false);
    expect(workspace.exists(`${PATHS.plansDir}/auth.md`)).toBe(true);
    expect(workspace.exists(`${PATHS.plansDir}/auth.temp.prompt.txt`)).toBe(true);
    expect(workspace.exists(`${PATHS.plansDir}/authentication.temp.prompt.md`)).toBe(true);
  });

  it("succeeds when optional task, execution, and plan artifacts are absent", () => {
    initializeWorkspace();
    workspace.writeFile(PATHS.specFile("auth"), "# Auth");

    const result = useCase.execute("auth");

    expect(result).toEqual({ kind: "deleted", specName: "auth" });
    expect(workspace.exists(PATHS.specFile("auth"))).toBe(false);
    expect(manifestRepository.load()).toEqual({ version: "1.0", documents: {} });
  });

  it("removes the specification from every manifest entry while preserving metadata and other associations", () => {
    initializeWorkspace();
    const authSpecPath = PATHS.specFile("auth");
    const billingSpecPath = PATHS.specFile("billing");
    workspace.writeFile(authSpecPath, "# Auth");
    workspace.writeFile(`${PATHS.docsDir}/shared-guide.md`, "# Shared guide");
    workspace.writeFile(`${PATHS.docsDir}/auth-guide.md`, "# Auth guide");
    writeManifest({
      version: "2.0",
      documents: {
        "shared-guide": {
          path: `${PATHS.docsDir}/shared-guide.md`,
          specs: [authSpecPath, billingSpecPath],
          scope: ["src/auth/**", "src/billing/**"],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
        "auth-guide": {
          path: `${PATHS.docsDir}/auth-guide.md`,
          specs: [authSpecPath],
          scope: ["src/auth/**"],
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
        "billing-guide": {
          path: `${PATHS.docsDir}/billing-guide.md`,
          specs: [billingSpecPath],
          scope: ["src/billing/**"],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      },
    });

    useCase.execute("auth");

    expect(manifestRepository.load()).toEqual({
      version: "2.0",
      documents: {
        "shared-guide": {
          path: `${PATHS.docsDir}/shared-guide.md`,
          specs: [billingSpecPath],
          scope: ["src/auth/**", "src/billing/**"],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
        "auth-guide": {
          path: `${PATHS.docsDir}/auth-guide.md`,
          specs: [],
          scope: ["src/auth/**"],
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
        "billing-guide": {
          path: `${PATHS.docsDir}/billing-guide.md`,
          specs: [billingSpecPath],
          scope: ["src/billing/**"],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      },
    });
    expect(workspace.exists(`${PATHS.docsDir}/shared-guide.md`)).toBe(true);
    expect(workspace.exists(`${PATHS.docsDir}/auth-guide.md`)).toBe(true);
  });

  it("preserves unrelated specification artifacts", () => {
    initializeWorkspace();
    workspace.writeFile(PATHS.specFile("auth"), "# Auth");
    workspace.writeFile(PATHS.specFile("billing"), "# Billing");
    workspace.writeFile(`${PATHS.tasksDir}/billing/TASK-001.json`, "billing task");
    workspace.writeFile(PATHS.executionState("billing"), "billing execution");
    workspace.writeFile(`${PATHS.plansDir}/billing.temp.prompt.md`, "billing prompt");
    writeManifest({ version: "1.0", documents: {} });

    useCase.execute("auth");

    expect(workspace.readFile(PATHS.specFile("billing"))).toBe("# Billing");
    expect(workspace.readFile(`${PATHS.tasksDir}/billing/TASK-001.json`)).toBe("billing task");
    expect(workspace.readFile(PATHS.executionState("billing"))).toBe("billing execution");
    expect(workspace.readFile(`${PATHS.plansDir}/billing.temp.prompt.md`)).toBe("billing prompt");
  });
});

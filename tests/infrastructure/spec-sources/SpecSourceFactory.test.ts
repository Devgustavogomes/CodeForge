import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpecSourceFactory } from "../../../src/infrastructure/spec-sources/SpecSourceFactory.js";
import { FilesystemSpecSource } from "../../../src/infrastructure/spec-sources/FilesystemSpecSource.js";
import { LinearSpecSource } from "../../../src/infrastructure/spec-sources/LinearSpecSource.js";
import { GitHubSpecSource } from "../../../src/infrastructure/spec-sources/GitHubSpecSource.js";
import { ClickUpSpecSource } from "../../../src/infrastructure/spec-sources/ClickUpSpecSource.js";
import { InMemoryWorkspaceGateway } from "../../helpers/in-memory-workspace.js";

describe("SpecSourceFactory", () => {
  it("returns the list of available providers", () => {
    expect(SpecSourceFactory.getAvailableProviders()).toEqual([
      "filesystem",
      "linear",
      "github",
      "clickup",
    ]);
  });

  it("instantiates FilesystemSpecSource", () => {
    const source = SpecSourceFactory.create("filesystem");
    expect(source).toBeInstanceOf(FilesystemSpecSource);
    expect(source.name).toBe("filesystem");
  });

  it("instantiates LinearSpecSource", () => {
    const source = SpecSourceFactory.create("linear");
    expect(source).toBeInstanceOf(LinearSpecSource);
    expect(source.name).toBe("linear");
  });

  it("instantiates GitHubSpecSource", () => {
    const source = SpecSourceFactory.create("github");
    expect(source).toBeInstanceOf(GitHubSpecSource);
    expect(source.name).toBe("github");
  });

  it("instantiates ClickUpSpecSource", () => {
    const source = SpecSourceFactory.create("clickup");
    expect(source).toBeInstanceOf(ClickUpSpecSource);
    expect(source.name).toBe("clickup");
  });

  it("handles case-insensitive provider names", () => {
    expect(SpecSourceFactory.create("FILESYSTEM")).toBeInstanceOf(FilesystemSpecSource);
    expect(SpecSourceFactory.create("Linear")).toBeInstanceOf(LinearSpecSource);
    expect(SpecSourceFactory.create("GitHub")).toBeInstanceOf(GitHubSpecSource);
    expect(SpecSourceFactory.create("CLICKUP")).toBeInstanceOf(ClickUpSpecSource);
  });

  it("throws descriptive error for unsupported provider", () => {
    expect(() => SpecSourceFactory.create("jira")).toThrow(
      "Unsupported spec source provider: jira"
    );
  });
});

describe("FilesystemSpecSource", () => {
  it("lists existing specs and extracts titles", async () => {
    const gateway = new InMemoryWorkspaceGateway({
      ".codeforge/specs/login.md": "# User Login\n\nLogin details",
      ".codeforge/specs/signup.md": "# User Signup\n\nSignup details",
      ".codeforge/specs/not-a-spec.txt": "ignore me",
    });

    const source = new FilesystemSpecSource(undefined, gateway);
    const specs = await source.list();

    expect(specs).toEqual([
      { id: "login", title: "User Login" },
      { id: "signup", title: "User Signup" },
    ]);
  });

  it("respects options.limit in list", async () => {
    const gateway = new InMemoryWorkspaceGateway({
      ".codeforge/specs/a.md": "# Spec A",
      ".codeforge/specs/b.md": "# Spec B",
      ".codeforge/specs/c.md": "# Spec C",
    });

    const source = new FilesystemSpecSource(undefined, gateway);
    const specs = await source.list({ limit: 2 });

    expect(specs).toHaveLength(2);
    expect(specs[0].id).toBe("a");
    expect(specs[1].id).toBe("b");
  });

  it("returns empty array if specs directory does not exist", async () => {
    const gateway = new InMemoryWorkspaceGateway({});
    const source = new FilesystemSpecSource(undefined, gateway);
    const specs = await source.list();

    expect(specs).toEqual([]);
  });

  it("fetches local spec content", async () => {
    const gateway = new InMemoryWorkspaceGateway({
      ".codeforge/specs/feature-x.md": "# Feature X\n\nThis is the description.",
    });

    const source = new FilesystemSpecSource(undefined, gateway);
    const spec = await source.fetch("feature-x");

    expect(spec.id).toBe("feature-x");
    expect(spec.title).toBe("Feature X");
    expect(spec.description).toBe("This is the description.");
  });

  it("throws friendly error when fetching non-existent local spec", async () => {
    const gateway = new InMemoryWorkspaceGateway({});
    const source = new FilesystemSpecSource(undefined, gateway);

    await expect(source.fetch("missing-spec")).rejects.toThrow(
      /Local spec "missing-spec" not found.*filesystem provider operates directly on local files/
    );
  });
});

describe("LinearSpecSource", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws error when API key is missing", async () => {
    delete process.env.LINEAR_API_KEY;
    const source = new LinearSpecSource();

    await expect(source.list()).rejects.toThrow(
      "Linear API key not found. Please set the LINEAR_API_KEY environment variable"
    );
  });

  it("uses apiKey directly from config instead of environment variable", async () => {
    delete process.env.LINEAR_API_KEY;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          issue: {
            id: "uuid-1",
            identifier: "ENG-101",
            title: "First Issue",
            description: "Detailed description",
            url: "https://linear.app/1",
          },
        },
      }),
    } as Response);

    const source = new LinearSpecSource({ provider: "linear", apiKey: "direct-api-token" });
    const result = await source.fetch("ENG-101");

    expect(result.id).toBe("ENG-101");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer direct-api-token",
        }),
      })
    );
  });

  it("lists issues from Linear GraphQL API", async () => {
    process.env.LINEAR_API_KEY = "dummy-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [
              { id: "1", identifier: "ENG-100", title: "First Issue", url: "https://linear.app/1", state: { name: "Todo" } },
              { id: "2", identifier: "ENG-101", title: "Second Issue", url: "https://linear.app/2", state: { name: "Done" } },
            ],
          },
        },
      }),
    } as Response);

    const source = new LinearSpecSource();
    const result = await source.list();

    expect(result).toEqual([
      { id: "ENG-100", title: "First Issue", url: "https://linear.app/1", status: "Todo" },
      { id: "ENG-101", title: "Second Issue", url: "https://linear.app/2", status: "Done" },
    ]);
  });

  it("fetches single issue from Linear GraphQL API", async () => {
    process.env.LINEAR_API_KEY = "dummy-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          issue: {
            id: "uuid-1",
            identifier: "ENG-100",
            title: "First Issue",
            description: "Detailed description",
            url: "https://linear.app/1",
            state: { name: "In Progress" },
            team: { name: "Engineering", key: "ENG" },
          },
        },
      }),
    } as Response);

    const source = new LinearSpecSource();
    const result = await source.fetch("ENG-100");

    expect(result).toEqual({
      id: "ENG-100",
      title: "First Issue",
      description: "Detailed description",
      url: "https://linear.app/1",
      metadata: {
        status: "In Progress",
        team: "Engineering",
        teamKey: "ENG",
      },
    });
  });

  it("throws error when issue is not found", async () => {
    process.env.LINEAR_API_KEY = "dummy-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { issue: null },
      }),
    } as Response);

    const source = new LinearSpecSource();
    await expect(source.fetch("ENG-999")).rejects.toThrow('Linear issue "ENG-999" not found.');
  });
});

describe("GitHubSpecSource", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws error when GitHub token is missing", async () => {
    delete process.env.GITHUB_TOKEN;
    const source = new GitHubSpecSource({ provider: "github", project: "org/repo" });

    await expect(source.list()).rejects.toThrow(
      "GitHub token not found. Please set the GITHUB_TOKEN environment variable"
    );
  });

  it("throws error when repository is not configured", async () => {
    process.env.GITHUB_TOKEN = "dummy-token";
    const source = new GitHubSpecSource({ provider: "github" });

    await expect(source.list()).rejects.toThrow(
      "GitHub repository not configured"
    );
  });

  it("lists issues from GitHub REST API", async () => {
    process.env.GITHUB_TOKEN = "dummy-token";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { number: 42, title: "Bug fix", html_url: "https://github.com/org/repo/issues/42", state: "open" },
        { number: 43, title: "A pull request", html_url: "https://github.com/org/repo/pull/43", state: "open", pull_request: {} },
      ],
    } as Response);

    const source = new GitHubSpecSource({ provider: "github", project: "org/repo" });
    const result = await source.list();

    expect(result).toEqual([
      { id: "42", title: "Bug fix", url: "https://github.com/org/repo/issues/42", status: "open" },
    ]);
  });

  it("fetches single issue from GitHub REST API", async () => {
    process.env.GITHUB_TOKEN = "dummy-token";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        number: 42,
        title: "Feature spec",
        body: "Spec content",
        html_url: "https://github.com/org/repo/issues/42",
        state: "open",
        user: { login: "octocat" },
      }),
    } as Response);

    const source = new GitHubSpecSource({ provider: "github", project: "org/repo" });
    const result = await source.fetch("42");

    expect(result).toEqual({
      id: "42",
      title: "Feature spec",
      description: "Spec content",
      url: "https://github.com/org/repo/issues/42",
      metadata: {
        status: "open",
        owner: "org",
        repo: "repo",
        author: "octocat",
      },
    });
  });

  it("handles 404 when fetching GitHub issue", async () => {
    process.env.GITHUB_TOKEN = "dummy-token";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    const source = new GitHubSpecSource({ provider: "github", project: "org/repo" });
    await expect(source.fetch("999")).rejects.toThrow("GitHub issue #999 not found in org/repo.");
  });
});

describe("ClickUpSpecSource", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws error when ClickUp API key is missing", async () => {
    delete process.env.CLICKUP_API_KEY;
    const source = new ClickUpSpecSource({ provider: "clickup", project: "list123" });

    await expect(source.list()).rejects.toThrow(
      "ClickUp API key not found. Please set the CLICKUP_API_KEY environment variable"
    );
  });

  it("throws error when list or team ID is not specified", async () => {
    process.env.CLICKUP_API_KEY = "dummy-key";
    const source = new ClickUpSpecSource({ provider: "clickup" });

    await expect(source.list()).rejects.toThrow(
      "ClickUp list or team ID not specified"
    );
  });

  it("lists tasks from ClickUp API", async () => {
    process.env.CLICKUP_API_KEY = "dummy-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tasks: [
          { id: "task1", custom_id: "CU-1", name: "Task 1", url: "https://app.clickup.com/t/task1", status: { status: "open" } },
        ],
      }),
    } as Response);

    const source = new ClickUpSpecSource({ provider: "clickup", project: "list123" });
    const result = await source.list();

    expect(result).toEqual([
      { id: "CU-1", title: "Task 1", url: "https://app.clickup.com/t/task1", status: "open" },
    ]);
  });

  it("fetches single task from ClickUp API", async () => {
    process.env.CLICKUP_API_KEY = "dummy-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: "task1",
        custom_id: "CU-1",
        name: "Task 1",
        markdown_description: "Task description",
        url: "https://app.clickup.com/t/task1",
        status: { status: "in progress" },
        list: { name: "Sprint 1" },
        project: { name: "Backend" },
      }),
    } as Response);

    const source = new ClickUpSpecSource({ provider: "clickup" });
    const result = await source.fetch("task1");

    expect(result).toEqual({
      id: "CU-1",
      title: "Task 1",
      description: "Task description",
      url: "https://app.clickup.com/t/task1",
      metadata: {
        status: "in progress",
        list: "Sprint 1",
        project: "Backend",
      },
    });
  });

  it("handles 404 when fetching ClickUp task", async () => {
    process.env.CLICKUP_API_KEY = "dummy-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    const source = new ClickUpSpecSource({ provider: "clickup" });
    await expect(source.fetch("missing")).rejects.toThrow('ClickUp task "missing" not found.');
  });
});

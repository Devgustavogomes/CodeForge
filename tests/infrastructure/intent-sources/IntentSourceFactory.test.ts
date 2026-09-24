import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IntentSourceFactory } from "../../../src/infrastructure/intent-sources/IntentSourceFactory.js";
import { FilesystemIntentSource } from "../../../src/infrastructure/intent-sources/FilesystemIntentSource.js";
import { LinearIntentSource } from "../../../src/infrastructure/intent-sources/LinearIntentSource.js";
import { GitHubIntentSource } from "../../../src/infrastructure/intent-sources/GitHubIntentSource.js";
import { ClickUpIntentSource } from "../../../src/infrastructure/intent-sources/ClickUpIntentSource.js";
import { InMemoryWorkspaceGateway } from "../../helpers/in-memory-workspace.js";

describe("IntentSourceFactory", () => {
  it("returns the list of available providers", () => {
    expect(IntentSourceFactory.getAvailableProviders()).toEqual([
      "filesystem",
      "linear",
      "github",
      "clickup",
    ]);
  });

  it("instantiates FilesystemIntentSource", () => {
    const source = IntentSourceFactory.create("filesystem");
    expect(source).toBeInstanceOf(FilesystemIntentSource);
    expect(source.name).toBe("filesystem");
  });

  it("instantiates LinearIntentSource", () => {
    const source = IntentSourceFactory.create("linear");
    expect(source).toBeInstanceOf(LinearIntentSource);
    expect(source.name).toBe("linear");
  });

  it("instantiates GitHubIntentSource", () => {
    const source = IntentSourceFactory.create("github");
    expect(source).toBeInstanceOf(GitHubIntentSource);
    expect(source.name).toBe("github");
  });

  it("instantiates ClickUpIntentSource", () => {
    const source = IntentSourceFactory.create("clickup");
    expect(source).toBeInstanceOf(ClickUpIntentSource);
    expect(source.name).toBe("clickup");
  });

  it("handles case-insensitive provider names", () => {
    expect(IntentSourceFactory.create("FILESYSTEM")).toBeInstanceOf(FilesystemIntentSource);
    expect(IntentSourceFactory.create("Linear")).toBeInstanceOf(LinearIntentSource);
    expect(IntentSourceFactory.create("GitHub")).toBeInstanceOf(GitHubIntentSource);
    expect(IntentSourceFactory.create("CLICKUP")).toBeInstanceOf(ClickUpIntentSource);
  });

  it("throws descriptive error for unsupported provider", () => {
    expect(() => IntentSourceFactory.create("jira")).toThrow(
      "Unsupported intent source provider: jira"
    );
  });

  it("returns correct default env variable for each provider", () => {
    expect(IntentSourceFactory.getDefaultEnvVar("github")).toBe("GITHUB_TOKEN");
    expect(IntentSourceFactory.getDefaultEnvVar("linear")).toBe("LINEAR_API_KEY");
    expect(IntentSourceFactory.getDefaultEnvVar("clickup")).toBe("CLICKUP_API_KEY");
    expect(IntentSourceFactory.getDefaultEnvVar("filesystem")).toBe("");
    expect(IntentSourceFactory.getDefaultEnvVar("unknown")).toBe("");
  });

  it("returns correct default apiKey ($VAR) for each provider", () => {
    expect(IntentSourceFactory.getDefaultApiKey("github")).toBe("$GITHUB_TOKEN");
    expect(IntentSourceFactory.getDefaultApiKey("linear")).toBe("$LINEAR_API_KEY");
    expect(IntentSourceFactory.getDefaultApiKey("clickup")).toBe("$CLICKUP_API_KEY");
    expect(IntentSourceFactory.getDefaultApiKey("filesystem")).toBe("");
    expect(IntentSourceFactory.getDefaultApiKey("unknown")).toBe("");
  });
});

describe("FilesystemIntentSource", () => {
  it("lists existing intents and extracts titles", async () => {
    const gateway = new InMemoryWorkspaceGateway({
      ".codeforge/intents/login.md": "# User Login\n\nLogin details",
      ".codeforge/intents/signup.md": "# User Signup\n\nSignup details",
      ".codeforge/intents/not-an-intent.txt": "ignore me",
    });

    const source = new FilesystemIntentSource(undefined, gateway);
    const intents = await source.list();

    expect(intents).toEqual([
      { id: "login", title: "User Login" },
      { id: "signup", title: "User Signup" },
    ]);
  });

  it("respects options.limit in list", async () => {
    const gateway = new InMemoryWorkspaceGateway({
      ".codeforge/intents/a.md": "# Intent A",
      ".codeforge/intents/b.md": "# Intent B",
      ".codeforge/intents/c.md": "# Intent C",
    });

    const source = new FilesystemIntentSource(undefined, gateway);
    const intents = await source.list({ limit: 2 });

    expect(intents).toHaveLength(2);
    expect(intents[0].id).toBe("a");
    expect(intents[1].id).toBe("b");
  });

  it("returns empty array if intents directory does not exist", async () => {
    const gateway = new InMemoryWorkspaceGateway({});
    const source = new FilesystemIntentSource(undefined, gateway);
    const intents = await source.list();

    expect(intents).toEqual([]);
  });

  it("fetches local intent content", async () => {
    const gateway = new InMemoryWorkspaceGateway({
      ".codeforge/intents/feature-x.md": "# Feature X\n\nThis is the description.",
    });

    const source = new FilesystemIntentSource(undefined, gateway);
    const intent = await source.fetch("feature-x");

    expect(intent.id).toBe("feature-x");
    expect(intent.title).toBe("Feature X");
    expect(intent.description).toBe("This is the description.");
  });

  it("throws friendly error when fetching non-existent local intent", async () => {
    const gateway = new InMemoryWorkspaceGateway({});
    const source = new FilesystemIntentSource(undefined, gateway);

    await expect(source.fetch("missing-intent")).rejects.toThrow(
      /Local intent "missing-intent" not found.*filesystem provider operates directly on local files/
    );
  });
});

describe("LinearIntentSource", () => {
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
    const source = new LinearIntentSource();

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

    const source = new LinearIntentSource({ provider: "linear", apiKey: "direct-api-token" });
    const result = await source.fetch("ENG-101");

    expect(result.id).toBe("ENG-101");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "direct-api-token",
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

    const source = new LinearIntentSource();
    const result = await source.list();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.linear.app/graphql",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "dummy-key" }) }),
    );

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

    const source = new LinearIntentSource();
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

    const source = new LinearIntentSource();
    await expect(source.fetch("ENG-999")).rejects.toThrow('Linear issue "ENG-999" not found.');
  });
});

describe("GitHubIntentSource", () => {
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
    const source = new GitHubIntentSource({ provider: "github", project: "org/repo" });

    await expect(source.list()).rejects.toThrow(
      "GitHub token not found. Please set the GITHUB_TOKEN environment variable"
    );
  });

  it("throws error when repository is not configured", async () => {
    process.env.GITHUB_TOKEN = "dummy-token";
    const source = new GitHubIntentSource({ provider: "github" });

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

    const source = new GitHubIntentSource({ provider: "github", project: "org/repo" });
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
        title: "Feature intent",
        body: "Intent content",
        html_url: "https://github.com/org/repo/issues/42",
        state: "open",
        user: { login: "octocat" },
      }),
    } as Response);

    const source = new GitHubIntentSource({ provider: "github", project: "org/repo" });
    const result = await source.fetch("42");

    expect(result).toEqual({
      id: "42",
      title: "Feature intent",
      description: "Intent content",
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

    const source = new GitHubIntentSource({ provider: "github", project: "org/repo" });
    await expect(source.fetch("999")).rejects.toThrow("GitHub issue #999 not found in org/repo.");
  });
});

describe("ClickUpIntentSource", () => {
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
    const source = new ClickUpIntentSource({ provider: "clickup", project: "list123" });

    await expect(source.list()).rejects.toThrow(
      "ClickUp API key not found. Please set the CLICKUP_API_KEY environment variable"
    );
  });

  it("throws error when list or team ID is not specified", async () => {
    process.env.CLICKUP_API_KEY = "dummy-key";
    const source = new ClickUpIntentSource({ provider: "clickup" });

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

    const source = new ClickUpIntentSource({ provider: "clickup", project: "list123" });
    const result = await source.list();

    expect(result).toEqual([
      { id: "task1", title: "Task 1", url: "https://app.clickup.com/t/task1", status: "open" },
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

    const source = new ClickUpIntentSource({ provider: "clickup" });
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

  it("fetches a listed task by its API ID even when a Workspace ID is configured", async () => {
    process.env.CLICKUP_API_KEY = "dummy-key";
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tasks: [{ id: "86abc", custom_id: "CU-1", name: "Task 1" }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "86abc", custom_id: "CU-1", name: "Task 1" }),
      } as Response);
    const source = new ClickUpIntentSource({ provider: "clickup", project: "123", team: "456" });

    const [reference] = await source.list();
    const intent = await source.fetch(reference.id);

    expect(reference.id).toBe("86abc");
    expect(intent.id).toBe("CU-1");
    expect(request.mock.calls[1][0]).toBe("https://api.clickup.com/api/v2/task/86abc");
  });

  it("handles 404 when fetching ClickUp task", async () => {
    process.env.CLICKUP_API_KEY = "dummy-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    const source = new ClickUpIntentSource({ provider: "clickup" });
    await expect(source.fetch("missing")).rejects.toThrow('ClickUp task "missing" not found.');
  });
});

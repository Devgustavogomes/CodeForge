import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubIntentSource } from "../../../src/infrastructure/intent-sources/GitHubIntentSource.js";
import { LinearIntentSource } from "../../../src/infrastructure/intent-sources/LinearIntentSource.js";
import { ClickUpIntentSource } from "../../../src/infrastructure/intent-sources/ClickUpIntentSource.js";

describe("Remote Intent Sources URL Parsing, API Key Resolution, and Timeout", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("GitHubIntentSource URL Parsing", () => {
    it("extracts owner, repo, and issueNumber from full GitHub issue URLs", () => {
      const source = new GitHubIntentSource();

      expect(source.getRepoInfo("https://github.com/owner/repo/issues/42")).toEqual({
        owner: "owner",
        repo: "repo",
        issueNumber: "42",
      });

      // With trailing slash
      expect(source.getRepoInfo("https://github.com/owner/repo/issues/42/")).toEqual({
        owner: "owner",
        repo: "repo",
        issueNumber: "42",
      });

      // With query parameters and fragment
      expect(
        source.getRepoInfo("https://github.com/owner/repo/issues/42?tab=comments#issuecomment-1234")
      ).toEqual({
        owner: "owner",
        repo: "repo",
        issueNumber: "42",
      });

      // HTTP protocol
      expect(source.getRepoInfo("http://github.com/owner/repo/issues/42")).toEqual({
        owner: "owner",
        repo: "repo",
        issueNumber: "42",
      });
    });

    it("extracts info from domain-prefixed or shorthand formats without protocol", () => {
      const source = new GitHubIntentSource();

      expect(source.getRepoInfo("github.com/owner/repo/issues/42")).toEqual({
        owner: "owner",
        repo: "repo",
        issueNumber: "42",
      });

      expect(source.getRepoInfo("owner/repo/issues/42")).toEqual({
        owner: "owner",
        repo: "repo",
        issueNumber: "42",
      });

      expect(source.getRepoInfo("owner/repo#42")).toEqual({
        owner: "owner",
        repo: "repo",
        issueNumber: "42",
      });

      expect(source.getRepoInfo("owner/repo/42")).toEqual({
        owner: "owner",
        repo: "repo",
        issueNumber: "42",
      });
    });

    it("falls back to config for owner and repo when shorthand issue number is provided", () => {
      const source = new GitHubIntentSource({ provider: "github", project: "org/my-project" });

      expect(source.getRepoInfo("#42")).toEqual({
        owner: "org",
        repo: "my-project",
        issueNumber: "42",
      });

      expect(source.getRepoInfo("42")).toEqual({
        owner: "org",
        repo: "my-project",
        issueNumber: "42",
      });
    });

    it("fetches issue using full URL", async () => {
      const source = new GitHubIntentSource({ provider: "github", apiKey: "gh-secret-token" });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          number: 101,
          title: "URL Issue",
          body: "Description from URL issue",
          html_url: "https://github.com/acme/project/issues/101",
          state: "open",
          user: { login: "dev" },
        }),
      } as Response);

      const intent = await source.fetch("https://github.com/acme/project/issues/101");

      expect(intent.id).toBe("101");
      expect(intent.title).toBe("URL Issue");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/acme/project/issues/101",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer gh-secret-token",
          }),
        })
      );
    });
  });

  describe("LinearIntentSource URL Parsing", () => {
    it("extracts issue identifier from full Linear URLs", () => {
      const source = new LinearIntentSource();

      expect(
        source.extractIssueId("https://linear.app/my-workspace/issue/ENG-123/slug-of-the-task")
      ).toBe("ENG-123");

      expect(source.extractIssueId("https://linear.app/my-workspace/issue/ENG-123")).toBe("ENG-123");

      expect(source.extractIssueId("https://linear.app/my-workspace/issue/ENG-123/")).toBe("ENG-123");

      expect(
        source.extractIssueId("https://linear.app/my-workspace/issue/ENG-123?tab=activity#comment-1")
      ).toBe("ENG-123");

      expect(source.extractIssueId("linear.app/my-workspace/issue/ENG-123/slug")).toBe("ENG-123");
    });

    it("preserves raw identifiers and UUIDs", () => {
      const source = new LinearIntentSource();

      expect(source.extractIssueId("ENG-123")).toBe("ENG-123");
      expect(source.extractIssueId("abc-def-uuid-456")).toBe("abc-def-uuid-456");
    });

    it("fetches issue using full Linear URL", async () => {
      const source = new LinearIntentSource({ provider: "linear", apiKey: "lin-secret-token" });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issue: {
              id: "uuid-123",
              identifier: "ENG-123",
              title: "Linear Full URL Issue",
              description: "Body",
              url: "https://linear.app/my-workspace/issue/ENG-123/linear-full-url-issue",
              state: { name: "Todo" },
              team: { name: "Core", key: "ENG" },
            },
          },
        }),
      } as Response);

      const intent = await source.fetch("https://linear.app/my-workspace/issue/ENG-123/linear-full-url-issue");

      expect(intent.id).toBe("ENG-123");
      expect(intent.title).toBe("Linear Full URL Issue");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.linear.app/graphql",
        expect.objectContaining({
          body: expect.stringContaining('"variables":{"id":"ENG-123"}'),
        })
      );
    });
  });

  describe("ClickUpIntentSource URL Parsing", () => {
    it("extracts taskId and teamId from full ClickUp URLs", () => {
      const source = new ClickUpIntentSource();

      expect(source.extractTaskInfo("https://app.clickup.com/t/task1")).toEqual({
        taskId: "task1",
      });

      expect(source.extractTaskInfo("https://app.clickup.com/t/901812345/CU-1")).toEqual({
        teamId: "901812345",
        taskId: "CU-1",
      });

      expect(source.extractTaskInfo("https://app.clickup.com/t/901812345/CU-1/")).toEqual({
        teamId: "901812345",
        taskId: "CU-1",
      });

      expect(
        source.extractTaskInfo("https://app.clickup.com/t/901812345/CU-1?param=test#section")
      ).toEqual({
        teamId: "901812345",
        taskId: "CU-1",
      });

      expect(source.extractTaskInfo("app.clickup.com/t/task1")).toEqual({
        taskId: "task1",
      });

      expect(source.extractTaskInfo("app.clickup.com/t/901812345/CU-1")).toEqual({
        teamId: "901812345",
        taskId: "CU-1",
      });
    });

    it("preserves shorthand task IDs and strips leading hash", () => {
      const source = new ClickUpIntentSource();

      expect(source.extractTaskInfo("#CU-1")).toEqual({ taskId: "CU-1" });
      expect(source.extractTaskInfo("CU-1")).toEqual({ taskId: "CU-1" });
      expect(source.extractTaskInfo("task123")).toEqual({ taskId: "task123" });
    });

    it("fetches task using full ClickUp URL with team ID", async () => {
      const source = new ClickUpIntentSource({ provider: "clickup", apiKey: "cu-token" });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "task99",
          custom_id: "CU-99",
          name: "ClickUp URL Task",
          markdown_description: "Description",
          url: "https://app.clickup.com/t/901812345/CU-99",
          status: { status: "ready" },
        }),
      } as Response);

      const intent = await source.fetch("https://app.clickup.com/t/901812345/CU-99");

      expect(intent.id).toBe("CU-99");
      expect(intent.title).toBe("ClickUp URL Task");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.clickup.com/api/v2/task/CU-99?custom_task_ids=true&team_id=901812345",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "cu-token",
          }),
        })
      );
    });
  });

  describe("API Key Resolution", () => {
    it("resolves apiKey directly from config.apiKey", () => {
      delete process.env.GITHUB_TOKEN;
      const gh = new GitHubIntentSource({ provider: "github", apiKey: "token-from-config" });
      expect(gh.getApiKey("GITHUB_TOKEN")).toBe("token-from-config");

      delete process.env.LINEAR_API_KEY;
      const lin = new LinearIntentSource({ provider: "linear", apiKey: "lin-token-from-config" });
      expect(lin.getApiKey("LINEAR_API_KEY")).toBe("lin-token-from-config");

      delete process.env.CLICKUP_API_KEY;
      const cu = new ClickUpIntentSource({ provider: "clickup", apiKey: "cu-token-from-config" });
      expect(cu.getApiKey("CLICKUP_API_KEY")).toBe("cu-token-from-config");
    });

    it("falls back to process.env when config.apiKey is not provided", () => {
      process.env.GITHUB_TOKEN = "env-gh-token";
      const gh = new GitHubIntentSource({ provider: "github" });
      expect(gh.getApiKey("GITHUB_TOKEN")).toBe("env-gh-token");

      process.env.LINEAR_API_KEY = "env-lin-token";
      const lin = new LinearIntentSource({ provider: "linear" });
      expect(lin.getApiKey("LINEAR_API_KEY")).toBe("env-lin-token");

      process.env.CLICKUP_API_KEY = "env-cu-token";
      const cu = new ClickUpIntentSource({ provider: "clickup" });
      expect(cu.getApiKey("CLICKUP_API_KEY")).toBe("env-cu-token");
    });

    it("throws informative error mentioning config.yaml apiKey and .env file when missing", () => {
      delete process.env.GITHUB_TOKEN;
      const gh = new GitHubIntentSource({ provider: "github" });

      expect(() => gh.getApiKey("GITHUB_TOKEN", "token")).toThrow(
        "GitHub token not found. Please set the GITHUB_TOKEN environment variable in the .env file or configure apiKey: $GITHUB_TOKEN in .codeforge/config.yaml."
      );
    });

    it("mentions custom envPath in error message when configured", () => {
      delete process.env.LINEAR_API_KEY;
      const lin = new LinearIntentSource({
        provider: "linear",
        envPath: ".env.custom",
      });

      expect(() => lin.getApiKey("LINEAR_API_KEY")).toThrow(
        "Linear API key not found. Please set the LINEAR_API_KEY environment variable in the .env.custom file or configure apiKey: $LINEAR_API_KEY in .codeforge/config.yaml."
      );
    });

    it("never leaks actual credentials in error messages", async () => {
      const secret = "super-secret-password-12345";
      const gh = new GitHubIntentSource({ provider: "github", apiKey: secret, project: "owner/repo" });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as Response);

      await expect(gh.fetch("1")).rejects.toMatchObject({
        name: "Error",
        message: expect.stringMatching(/GitHub authentication failed \(401\)\./),
      });
    });
  });

  describe("HTTP Timeout Handling (15 seconds)", () => {
    it("enforces a 15-second AbortSignal timeout on requests", async () => {
      const gh = new GitHubIntentSource({ provider: "github", apiKey: "token", project: "org/repo" });

      vi.spyOn(globalThis, "fetch").mockImplementationOnce((_url, init) => {
        const signal = (init as RequestInit)?.signal;
        expect(signal).toBeDefined();
        expect(signal).toBeInstanceOf(AbortSignal);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ number: 1, title: "T", body: "", html_url: "url" }),
        } as Response);
      });

      await gh.fetch("1");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("produces user-friendly timeout error when fetch exceeds timeout in GitHub", async () => {
      const gh = new GitHubIntentSource({ provider: "github", apiKey: "token", project: "org/repo" });

      const timeoutError = new DOMException("The operation was aborted due to timeout", "TimeoutError");
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(timeoutError);

      await expect(gh.fetch("42")).rejects.toThrow(
        'Failed to fetch intent "42" from GitHub: Request to GitHub timed out after 15s. Please check your network connection.'
      );
    });

    it("produces user-friendly timeout error when fetch exceeds timeout in Linear", async () => {
      const lin = new LinearIntentSource({ provider: "linear", apiKey: "token" });

      const timeoutError = new DOMException("The operation was aborted due to timeout", "TimeoutError");
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(timeoutError);

      await expect(lin.list()).rejects.toThrow(
        "Failed to list intents from Linear: Request to Linear timed out after 15s. Please check your network connection."
      );
    });

    it("produces user-friendly timeout error when fetch exceeds timeout in ClickUp", async () => {
      const cu = new ClickUpIntentSource({ provider: "clickup", apiKey: "token" });

      const timeoutError = new DOMException("The operation was aborted due to timeout", "TimeoutError");
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(timeoutError);

      await expect(cu.fetch("task123")).rejects.toThrow(
        'Failed to fetch intent "task123" from ClickUp: Request to ClickUp timed out after 15s. Please check your network connection.'
      );
    });
  });
});

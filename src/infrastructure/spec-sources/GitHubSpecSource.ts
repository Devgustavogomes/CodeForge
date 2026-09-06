import { FetchedSpec, SpecReference } from "../../domain/spec-source.js";
import { ListSpecOptions } from "../../application/ports/SpecSource.js";
import { BaseRemoteSpecSource } from "./BaseRemoteSpecSource.js";

export class GitHubSpecSource extends BaseRemoteSpecSource {
  readonly name = "github";

  private getRepoInfo(id?: string): { owner: string; repo: string; issueNumber?: string } {
    let owner = (this.config?.owner as string) || "";
    let repo = (this.config?.repo as string) || "";
    const repoSlug = (this.config?.project || this.config?.repository) as string | undefined;

    if (!owner && repoSlug && repoSlug.includes("/")) {
      const parts = repoSlug.split("/");
      owner = parts[0];
      repo = parts[1];
    }

    let issueNumber: string | undefined;

    if (id) {
      if (id.includes("/")) {
        const cleaned = id.replace(/#/, "/");
        const parts = cleaned.split("/").filter(Boolean);
        if (parts.length >= 3 && parts[parts.length - 2] === "issues") {
          owner = parts[0];
          repo = parts[1];
          issueNumber = parts[parts.length - 1];
        } else if (parts.length >= 3) {
          owner = parts[0];
          repo = parts[1];
          issueNumber = parts[2];
        }
      } else {
        issueNumber = id.replace(/^#/, "");
      }
    }

    return { owner, repo, issueNumber };
  }

  async list(options?: ListSpecOptions): Promise<SpecReference[]> {
    const token = this.getApiKey("GITHUB_TOKEN", "token");
    const { owner, repo } = this.getRepoInfo();

    if (!owner || !repo) {
      throw new Error(
        "GitHub repository not configured. Please set 'project' (e.g. 'owner/repo') in .codeforge/config.yaml to list issues."
      );
    }

    const limit = options?.limit ?? 30;
    const state = options?.status ?? "open";
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?per_page=${limit}&state=${encodeURIComponent(state)}`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "CodeForge",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `GitHub authentication failed (${response.status}). Please verify the token in ${this.config?.apiKeyEnv || "GITHUB_TOKEN"}.`
          );
        }
        throw new Error(`GitHub API request failed with status ${response.status}: ${response.statusText}`);
      }

      const issues = (await response.json()) as Array<{
        number: number;
        title: string;
        html_url: string;
        state: string;
        pull_request?: unknown;
      }>;

      return issues
        .filter((item) => !item.pull_request)
        .map((item) => ({
          id: String(item.number),
          title: item.title,
          url: item.html_url,
          status: item.state,
        }));
    } catch (error: unknown) {
      this.wrapError("list", "", error);
    }
  }

  async fetch(id: string): Promise<FetchedSpec> {
    const token = this.getApiKey("GITHUB_TOKEN", "token");
    const { owner, repo, issueNumber } = this.getRepoInfo(id);

    if (!owner || !repo || !issueNumber) {
      throw new Error(
        `Invalid GitHub issue identifier: "${id}". Please provide an issue number and configure repository in .codeforge/config.yaml (e.g. project: 'owner/repo') or use 'owner/repo#<number>'.`
      );
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "CodeForge",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`GitHub issue #${issueNumber} not found in ${owner}/${repo}.`);
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `GitHub authentication failed (${response.status}). Please verify the token in ${this.config?.apiKeyEnv || "GITHUB_TOKEN"}.`
          );
        }
        throw new Error(`GitHub API request failed with status ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        number: number;
        title: string;
        body?: string;
        html_url?: string;
        state?: string;
        user?: { login?: string };
      };

      return {
        id: String(data.number),
        title: data.title,
        description: data.body || "",
        url: data.html_url,
        metadata: {
          status: data.state,
          owner,
          repo,
          author: data.user?.login,
        },
      };
    } catch (error: unknown) {
      this.wrapError("fetch", id, error);
    }
  }
}

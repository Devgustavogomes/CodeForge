import { FetchedSpec, SpecReference } from "../../domain/spec-source.js";
import { ListSpecOptions } from "../../application/ports/SpecSource.js";
import { BaseRemoteSpecSource } from "./BaseRemoteSpecSource.js";

export class LinearSpecSource extends BaseRemoteSpecSource {
  readonly name = "linear";

  /**
   * Extracts an issue identifier (e.g. "ENG-123") from a Linear issue URL or raw identifier.
   */
  public extractIssueId(input: string): string {
    if (!input) return input;
    const trimmed = input.trim();

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const url = new URL(trimmed);
        const segments = url.pathname.split("/").filter(Boolean);
        const issueIdx = segments.indexOf("issue");
        if (issueIdx !== -1 && issueIdx + 1 < segments.length) {
          return segments[issueIdx + 1];
        }
      } catch {
        // Fall through
      }
    }

    const match = trimmed.match(/(?:linear\.app\/[^/]+\/issue\/)([A-Za-z0-9_-]+)/i);
    if (match) {
      return match[1];
    }

    return trimmed;
  }

  async list(options?: ListSpecOptions): Promise<SpecReference[]> {
    const apiKey = this.getApiKey("LINEAR_API_KEY");
    const limit = options?.limit ?? 20;

    const query = `
      query ListIssues($first: Int) {
        issues(first: $first, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
          nodes {
            id
            identifier
            title
            url
            state {
              name
            }
          }
        }
      }
    `;

    try {
      const response = await this.fetchWithTimeout("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          variables: { first: limit },
        }),
      });

      if (!response.ok) {
        throw new Error(`Linear API request failed with status ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        data?: {
          issues?: {
            nodes?: Array<{
              id: string;
              identifier?: string;
              title: string;
              url?: string;
              state?: { name?: string };
            }>;
          };
        };
        errors?: Array<{ message: string }>;
      };

      if (data.errors && data.errors.length > 0) {
        throw new Error(`Linear GraphQL error: ${data.errors.map((e) => e.message).join("; ")}`);
      }

      const nodes = data.data?.issues?.nodes ?? [];
      let references: SpecReference[] = nodes.map((node) => ({
        id: node.identifier || node.id,
        title: node.title,
        url: node.url,
        status: node.state?.name,
      }));

      if (options?.status) {
        const expectedStatus = options.status.toLowerCase();
        references = references.filter(
          (ref) => ref.status && ref.status.toLowerCase().includes(expectedStatus)
        );
      }

      return references;
    } catch (error: unknown) {
      this.wrapError("list", "", error);
    }
  }

  async fetch(id: string): Promise<FetchedSpec> {
    const apiKey = this.getApiKey("LINEAR_API_KEY");
    const issueId = this.extractIssueId(id);

    const query = `
      query GetIssue($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          url
          state {
            name
          }
          team {
            name
            key
          }
        }
      }
    `;

    try {
      const response = await this.fetchWithTimeout("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          variables: { id: issueId },
        }),
      });

      if (!response.ok) {
        throw new Error(`Linear API request failed with status ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        data?: {
          issue?: {
            id: string;
            identifier?: string;
            title: string;
            description?: string;
            url?: string;
            state?: { name?: string };
            team?: { name?: string; key?: string };
          } | null;
        };
        errors?: Array<{ message: string }>;
      };

      if (data.errors && data.errors.length > 0) {
        throw new Error(`Linear GraphQL error: ${data.errors.map((e) => e.message).join("; ")}`);
      }

      const issue = data.data?.issue;
      if (!issue) {
        throw new Error(`Linear issue "${id}" not found.`);
      }

      return {
        id: issue.identifier || issue.id,
        title: issue.title,
        description: issue.description || "",
        url: issue.url,
        metadata: {
          status: issue.state?.name,
          team: issue.team?.name,
          teamKey: issue.team?.key,
        },
      };
    } catch (error: unknown) {
      this.wrapError("fetch", id, error);
    }
  }
}

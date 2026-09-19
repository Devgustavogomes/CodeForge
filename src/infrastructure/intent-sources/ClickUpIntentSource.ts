import { FetchedIntent, IntentReference } from "../../domain/intent-source.js";
import { ListIntentOptions } from "../../application/ports/IntentSource.js";
import { BaseRemoteIntentSource } from "./BaseRemoteIntentSource.js";

export class ClickUpIntentSource extends BaseRemoteIntentSource {
  readonly name = "clickup";

  /**
   * Extracts taskId and optional teamId from a ClickUp task URL or raw task ID.
   */
  public extractTaskInfo(input: string): { taskId: string; teamId?: string } {
    if (!input) return { taskId: input };
    const trimmed = input.trim();

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const url = new URL(trimmed);
        const segments = url.pathname.split("/").filter(Boolean);
        const tIndex = segments.indexOf("t");
        if (tIndex !== -1) {
          const remaining = segments.slice(tIndex + 1);
          if (remaining.length === 1) {
            return { taskId: remaining[0] };
          } else if (remaining.length >= 2) {
            return { teamId: remaining[0], taskId: remaining[1] };
          }
        }
      } catch {
        // Fall through
      }
    }

    const matchTwo = trimmed.match(/app\.clickup\.com\/t\/([^/]+)\/([^/?#]+)/i);
    if (matchTwo) {
      return { teamId: matchTwo[1], taskId: matchTwo[2] };
    }
    const matchOne = trimmed.match(/app\.clickup\.com\/t\/([^/?#]+)/i);
    if (matchOne) {
      return { taskId: matchOne[1] };
    }

    return { taskId: trimmed.replace(/^#/, "") };
  }

  async list(options?: ListIntentOptions): Promise<IntentReference[]> {
    const apiKey = this.getApiKey("CLICKUP_API_KEY");
    const listId = (this.config?.listId || this.config?.project) as string | undefined;
    const teamId = (this.config?.teamId || this.config?.team) as string | undefined;

    let url: string;
    if (listId) {
      url = `https://api.clickup.com/api/v2/list/${listId}/task?page=0`;
    } else if (teamId) {
      url = `https://api.clickup.com/api/v2/team/${teamId}/task?page=0`;
    } else {
      throw new Error(
        "ClickUp list or team ID not specified. Please configure 'project' (list ID) or 'team' in .codeforge/config.yaml to list tasks."
      );
    }

    try {
      const response = await this.fetchWithTimeout(url, {
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            `ClickUp authentication failed (401). Please verify the API key in .codeforge/config.yaml (apiKey) or CLICKUP_API_KEY environment variable.`
          );
        }
        throw new Error(`ClickUp API request failed with status ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        tasks?: Array<{
          id: string;
          custom_id?: string;
          name: string;
          url?: string;
          status?: { status?: string };
        }>;
      };

      const tasks = data.tasks ?? [];
      let references: IntentReference[] = tasks.map((task) => ({
        id: task.custom_id || task.id,
        title: task.name,
        // The ClickUp tasks endpoint does not always populate `url`; build it as a fallback.
        url: task.url || `https://app.clickup.com/t/${task.id}`,
        status: task.status?.status,
      }));

      if (options?.status) {
        const expected = options.status.toLowerCase();
        references = references.filter(
          (ref) => ref.status && ref.status.toLowerCase().includes(expected)
        );
      }

      if (options?.limit && references.length > options.limit) {
        references = references.slice(0, options.limit);
      }

      return references;
    } catch (error: unknown) {
      this.wrapError("list", "", error);
    }
  }

  async fetch(id: string): Promise<FetchedIntent> {
    const apiKey = this.getApiKey("CLICKUP_API_KEY");
    const { taskId, teamId: urlTeamId } = this.extractTaskInfo(id);
    const teamId = urlTeamId || ((this.config?.teamId || this.config?.team) as string | undefined);
    const queryParam = teamId ? `?custom_task_ids=true&team_id=${teamId}` : "";
    const url = `https://api.clickup.com/api/v2/task/${taskId}${queryParam}`;

    try {
      const response = await this.fetchWithTimeout(url, {
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`ClickUp task "${id}" not found.`);
        }
        if (response.status === 401) {
          throw new Error(
            `ClickUp authentication failed (401). Please verify the API key in .codeforge/config.yaml (apiKey) or CLICKUP_API_KEY environment variable.`
          );
        }
        throw new Error(`ClickUp API request failed with status ${response.status}: ${response.statusText}`);
      }

      const task = (await response.json()) as {
        id: string;
        custom_id?: string;
        name: string;
        description?: string;
        text_content?: string;
        markdown_description?: string;
        url?: string;
        status?: { status?: string };
        list?: { name?: string };
        project?: { name?: string };
      };

      return {
        id: task.custom_id || task.id,
        title: task.name,
        description: task.markdown_description || task.description || task.text_content || "",
        url: task.url || `https://app.clickup.com/t/${task.id}`,
        metadata: {
          status: task.status?.status,
          list: task.list?.name,
          project: task.project?.name,
        },
      };
    } catch (error: unknown) {
      this.wrapError("fetch", id, error);
    }
  }
}

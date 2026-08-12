/**
 * Snag agent-provider abstraction.
 *
 * Deliberately dependency-free (plain fetch, no Supabase/Deno-specific
 * imports) so it can be extracted into a standalone package later.
 */

export type AgentTaskStatus = "queued" | "running" | "finished" | "error";

export interface AgentImage {
  base64: string;
  width: number;
  height: number;
}

export interface CreateAgentTaskInput {
  prompt: string;
  images?: AgentImage[];
  repository: string;
  ref: string;
  model?: string;
  webhook?: { url: string; secret: string };
}

export interface AgentTask {
  id: string;
  url: string | null;
  status: AgentTaskStatus;
  branchName: string | null;
  prUrl: string | null;
  summary: string | null;
}

export interface AgentProvider {
  createTask(input: CreateAgentTaskInput): Promise<AgentTask>;
  getStatus(taskId: string): Promise<AgentTask | null>;
  followUp(
    taskId: string,
    prompt: string,
    images?: AgentImage[],
  ): Promise<void>;
}

const CURSOR_API_BASE = "https://api.cursor.com/v0";

interface CursorAgentResponse {
  id: string;
  status?: string;
  target?: {
    url?: string;
    branchName?: string;
    prUrl?: string;
  };
  summary?: string;
}

/** Safe, user-facing launch failure — never includes raw API bodies or secrets. */
export class AgentLaunchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AgentLaunchError";
    this.status = status;
  }
}

/**
 * Map Cursor API failures to short messages safe to show in the Snag UI and
 * store on `snag_requests.error`. Never echo the raw response body.
 */
export function classifyCursorLaunchError(
  status: number,
  body: string,
): string {
  const lower = body.toLowerCase();
  if (status === 401 || status === 403) {
    return "Cursor API key cannot access this repository. Check the key and GitHub link in Cursor.";
  }
  if (status === 429) {
    return "Cursor rate limit — try again shortly.";
  }
  if (status === 404) {
    return "Cursor could not find that repository or branch.";
  }
  if (
    /branch|ref|not found|does not exist|unknown revision|invalid ref/.test(
      lower,
    )
  ) {
    return "Repository branch not found. Ask your Snag admin to check repo_ref.";
  }
  if (/repositor|repo|access|permission|unauthorized|forbidden/.test(lower)) {
    return "Cursor API key cannot access this repository. Check the key and GitHub link in Cursor.";
  }
  return "Could not launch agent. Your Snag admin can check relay logs.";
}

export function userFacingLaunchError(error: unknown): string {
  if (error instanceof AgentLaunchError) return error.message;
  return "Could not launch agent. Your Snag admin can check relay logs.";
}

export function cursorProvider(options: { apiKey: string }): AgentProvider {
  const authHeader = `Basic ${btoa(`${options.apiKey}:`)}`;

  async function request(
    path: string,
    init: RequestInit,
  ): Promise<CursorAgentResponse> {
    const response = await fetch(`${CURSOR_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // Log status + truncated body for admins; never return body to clients.
      console.error(
        `cursor API ${init.method ?? "GET"} ${path} failed (${response.status}): ${body.slice(0, 300)}`,
      );
      throw new AgentLaunchError(
        classifyCursorLaunchError(response.status, body),
        response.status,
      );
    }
    return (await response.json()) as CursorAgentResponse;
  }

  return {
    async createTask(input: CreateAgentTaskInput): Promise<AgentTask> {
      const payload: Record<string, unknown> = {
        prompt: {
          text: input.prompt,
          ...(input.images?.length
            ? {
                images: input.images.map((image) => ({
                  data: image.base64,
                  dimension: { width: image.width, height: image.height },
                })),
              }
            : {}),
        },
        source: { repository: input.repository, ref: input.ref },
      };
      if (input.model) payload.model = input.model;
      if (input.webhook) payload.webhook = input.webhook;

      const agent = await request("/agents", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return toAgentTask(agent);
    },

    async getStatus(taskId: string): Promise<AgentTask | null> {
      try {
        const agent = await request(`/agents/${encodeURIComponent(taskId)}`, {
          method: "GET",
        });
        return toAgentTask(agent);
      } catch (error) {
        console.warn("cursor getStatus failed:", error);
        return null;
      }
    },

    async followUp(
      taskId: string,
      prompt: string,
      images?: AgentImage[],
    ): Promise<void> {
      const payload: Record<string, unknown> = {
        prompt: {
          text: prompt,
          ...(images?.length
            ? {
                images: images.map((image) => ({
                  data: image.base64,
                  dimension: { width: image.width, height: image.height },
                })),
              }
            : {}),
        },
      };
      await request(`/agents/${encodeURIComponent(taskId)}/followup`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  };
}

function toAgentTask(agent: CursorAgentResponse): AgentTask {
  return {
    id: agent.id,
    url: agent.target?.url ?? null,
    status: mapCursorStatus(agent.status),
    branchName: agent.target?.branchName ?? null,
    prUrl: agent.target?.prUrl ?? null,
    summary: agent.summary ?? null,
  };
}

export function mapCursorStatus(status: string | undefined): AgentTaskStatus {
  switch ((status ?? "").toUpperCase()) {
    case "FINISHED":
      return "finished";
    case "ERROR":
    case "EXPIRED":
      return "error";
    case "PENDING":
    case "CREATING":
      return "queued";
    default:
      return "running";
  }
}

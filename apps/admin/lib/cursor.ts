import type { AgentConversationMessage } from "@snag/shared";

const CURSOR_API_BASE = "https://api.cursor.com/v0";

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

/** Mirrors the follow-up call in supabase/functions/_shared/agent_provider.ts. */
export async function sendCursorFollowUp(
  apiKey: string,
  agentId: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${CURSOR_API_BASE}/agents/${encodeURIComponent(agentId)}/followup`, {
    method: "POST",
    headers: {
      Authorization: authHeader(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: { text } }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Cursor follow-up failed (${res.status})`);
  }
}

export class CursorRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Cursor request failed (${status})`);
    this.status = status;
  }
}

export async function fetchCursorConversation(
  apiKey: string,
  agentId: string,
): Promise<AgentConversationMessage[]> {
  const res = await fetch(
    `${CURSOR_API_BASE}/agents/${encodeURIComponent(agentId)}/conversation`,
    { headers: { Authorization: authHeader(apiKey) }, cache: "no-store" },
  );
  if (!res.ok) throw new CursorRequestError(res.status);
  const body = (await res.json()) as {
    messages?: Array<{ id?: string; type?: string; text?: string }>;
  };
  return (body.messages ?? []).flatMap((message, index) => {
    const type = (message.type ?? "").toLowerCase();
    const role = type.startsWith("assistant") ? "assistant" : type.startsWith("user") ? "user" : null;
    const text = message.text?.trim();
    if (!role || !text) return [];
    return [{ id: message.id ?? String(index), role, text }];
  });
}

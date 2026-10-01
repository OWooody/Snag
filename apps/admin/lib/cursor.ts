const CURSOR_API_BASE = "https://api.cursor.com/v0";

/** Mirrors the follow-up call in supabase/functions/_shared/agent_provider.ts. */
export async function sendCursorFollowUp(
  apiKey: string,
  agentId: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${CURSOR_API_BASE}/agents/${encodeURIComponent(agentId)}/followup`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: { text } }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Cursor follow-up failed (${res.status})`);
  }
}

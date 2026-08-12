/**
 * snag-webhook — Cursor Cloud Agents status webhook for Snag requests.
 *
 * Cursor POSTs `statusChange` events (FINISHED / ERROR) for agents launched
 * by snag-relay. The HMAC-SHA256 signature is verified against
 * SNAG_WEBHOOK_SECRET using the RAW body before any parsing.
 *
 * When Cursor omits `summary` (known v0 API gap), we fall back to
 * GET /v0/agents/{id}/conversation and store the trailing assistant text.
 */

import { createServiceClient } from "../_shared/supabase.ts";
import {
  cursorProvider,
  mapCursorStatus,
  resolveSummaryWithConversationFallback,
} from "../_shared/agent_provider.ts";
import { decryptSecret, getEncryptionSecret } from "../_shared/crypto.ts";
import {
  mapTerminalRequestStatus,
  resolveEffectiveRequesterFollowups,
} from "../_shared/requester_questions.ts";

interface CursorWebhookPayload {
  event?: string;
  id?: string;
  status?: string;
  summary?: string;
  target?: {
    url?: string;
    branchName?: string;
    prUrl?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("SNAG_WEBHOOK_SECRET");
  if (!secret) {
    console.warn("snag-webhook called but SNAG_WEBHOOK_SECRET is unset");
    return new Response("Not configured", { status: 403 });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("X-Webhook-Signature") ?? "";

    if (!(await verifySignature(rawBody, signature, secret))) {
      console.warn("snag-webhook rejected: bad_signature");
      return new Response("Invalid signature", { status: 401 });
    }

    const payload = JSON.parse(rawBody) as CursorWebhookPayload;
    if (payload.event !== "statusChange" || !payload.id) {
      return new Response("Ignored", { status: 200 });
    }

    const service = createServiceClient();
    const { data: existing } = await service
      .from("snag_requests")
      .select(
        "id, project_id, snag_projects(cursor_api_key_encrypted, requester_followups_enabled, snag_organizations(requester_followups_enabled))",
      )
      .eq("agent_id", payload.id)
      .maybeSingle();

    const project = existing?.snag_projects as
      | {
          cursor_api_key_encrypted: string;
          requester_followups_enabled: boolean | null;
          snag_organizations: { requester_followups_enabled: boolean } | null;
        }
      | null
      | undefined;

    const followupsEnabled = resolveEffectiveRequesterFollowups(
      project?.requester_followups_enabled,
      project?.snag_organizations?.requester_followups_enabled,
    );

    let summary = payload.summary?.trim() || null;
    if (!summary && project?.cursor_api_key_encrypted) {
      try {
        const cursorApiKey = await decryptSecret(
          project.cursor_api_key_encrypted,
          getEncryptionSecret(),
        );
        const provider = cursorProvider({ apiKey: cursorApiKey });
        summary = await resolveSummaryWithConversationFallback(
          provider,
          payload.id,
          payload.summary,
        );
      } catch (error) {
        console.warn("snag-webhook conversation fallback failed:", error);
      }
    }

    const cursorMapped = mapCursorStatus(payload.status);
    const status = mapTerminalRequestStatus(
      cursorMapped,
      summary,
      followupsEnabled,
    );

    const update: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (payload.target?.url) update.agent_url = payload.target.url;
    if (payload.target?.branchName) update.branch_name = payload.target.branchName;
    if (payload.target?.prUrl) update.pr_url = payload.target.prUrl;
    if (summary) update.summary = summary;
    if (status === "error") update.error = "Agent run failed";

    const { error } = await service
      .from("snag_requests")
      .update(update)
      .eq("agent_id", payload.id);

    if (error) {
      console.error("snag-webhook update failed:", error);
      return new Response("Update failed", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("snag-webhook error:", error);
    return new Response("Internal server error", { status: 500 });
  }
});

async function verifySignature(
  rawBody: string,
  header: string,
  secret: string,
): Promise<boolean> {
  if (!header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length).toLowerCase();

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

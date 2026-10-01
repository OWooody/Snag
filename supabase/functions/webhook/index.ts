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
import {
  handleAgentTerminal,
  type LifecycleRow,
  REQUEST_LIFECYCLE_COLUMNS,
} from "../_shared/lifecycle.ts";
import { decryptProjectSecret, loadProjectById } from "../_shared/projects.ts";

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
    const { data: existing, error: loadError } = await service
      .from("snag_requests")
      .select(REQUEST_LIFECYCLE_COLUMNS)
      .eq("agent_id", payload.id)
      .maybeSingle();

    if (loadError) {
      console.error("snag-webhook load failed:", loadError);
      return new Response("Load failed", { status: 500 });
    }
    if (!existing) {
      return new Response("Unknown agent", { status: 200 });
    }

    const row = existing as LifecycleRow;
    const project = await loadProjectById(service, row.project_id);
    if (!project) {
      return new Response("Unknown project", { status: 200 });
    }

    const cursorApiKey = await decryptProjectSecret(project.cursor_api_key_encrypted);
    if (!cursorApiKey) {
      return new Response("Project key unavailable", { status: 500 });
    }
    const provider = cursorProvider({ apiKey: cursorApiKey });

    const cursorMapped = mapCursorStatus(payload.status);
    if (cursorMapped !== "finished" && cursorMapped !== "error") {
      return new Response("Ignored", { status: 200 });
    }

    let summary = payload.summary?.trim() || null;
    if (!summary) {
      summary = await resolveSummaryWithConversationFallback(
        provider,
        payload.id,
        payload.summary,
      );
    }

    await handleAgentTerminal({ service, provider, project }, row, {
      status: cursorMapped,
      summary,
      url: payload.target?.url ?? null,
      branchName: payload.target?.branchName ?? null,
      prUrl: payload.target?.prUrl ?? null,
    });

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

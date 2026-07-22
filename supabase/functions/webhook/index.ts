/**
 * snag-webhook — Cursor Cloud Agents status webhook for Snag requests.
 *
 * Cursor POSTs `statusChange` events (FINISHED / ERROR) for agents launched
 * by snag-relay. The HMAC-SHA256 signature is verified against
 * SNAG_WEBHOOK_SECRET using the RAW body before any parsing.
 */

import { createServiceClient } from "../_shared/supabase.ts";
import { mapCursorStatus } from "../_shared/agent_provider.ts";

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

    const status = mapCursorStatus(payload.status);
    const update: Record<string, unknown> = {
      status: status === "queued" ? "running" : status,
      updated_at: new Date().toISOString(),
    };
    if (payload.target?.url) update.agent_url = payload.target.url;
    if (payload.target?.branchName) update.branch_name = payload.target.branchName;
    if (payload.target?.prUrl) update.pr_url = payload.target.prUrl;
    if (payload.summary) update.summary = payload.summary;
    if (status === "error") update.error = "Agent run failed";

    const { error } = await createServiceClient()
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

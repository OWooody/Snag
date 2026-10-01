/**
 * snag-delivery-worker — advances execute-mode requests whose PRs passed
 * policy (preview → confirmation → CI → merge) and notices when developers
 * merge or close PRs that were handed to them.
 *
 * Triggered every minute by pg_cron + pg_net (see docs/OPERATIONS.md) with
 * header `x-snag-worker-secret: $SNAG_WORKER_SECRET`.
 */

import { advanceDelivery, type DeliveryRunState } from "../_shared/delivery.ts";
import { type LifecycleRow, REQUEST_LIFECYCLE_COLUMNS } from "../_shared/lifecycle.ts";
import { loadProjectById, type ProjectRow } from "../_shared/projects.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const BATCH_LIMIT = 50;
const TIME_BUDGET_MS = 50_000;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("SNAG_WORKER_SECRET");
  if (!secret || secret.length < 32) {
    console.warn("snag-delivery-worker called but SNAG_WORKER_SECRET is unset or too short");
    return new Response("Not configured", { status: 403 });
  }
  if (!constantTimeEquals(req.headers.get("x-snag-worker-secret") ?? "", secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const service = createServiceClient();

  const [delivering, handedOff] = await Promise.all([
    service
      .from("snag_requests")
      .select(REQUEST_LIFECYCLE_COLUMNS)
      .eq("phase", "delivering")
      .in("status", ["running", "awaiting_confirmation"])
      .order("updated_at", { ascending: true })
      .limit(BATCH_LIMIT),
    service
      .from("snag_requests")
      .select(REQUEST_LIFECYCLE_COLUMNS)
      .eq("status", "awaiting_review")
      .not("pr_url", "is", null)
      .order("updated_at", { ascending: true })
      .limit(BATCH_LIMIT),
  ]);

  if (delivering.error || handedOff.error) {
    console.error("snag-delivery-worker load failed:", delivering.error ?? handedOff.error);
    return new Response("Load failed", { status: 500 });
  }

  const rows = [
    ...((delivering.data ?? []) as LifecycleRow[]),
    ...((handedOff.data ?? []) as LifecycleRow[]),
  ];
  const projects = new Map<string, ProjectRow | null>();
  const state: DeliveryRunState = { mergedProjects: new Set() };
  let processed = 0;

  for (const row of rows) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    if (!projects.has(row.project_id)) {
      projects.set(row.project_id, await loadProjectById(service, row.project_id));
    }
    const project = projects.get(row.project_id);
    if (!project || !project.enabled) continue;
    try {
      await advanceDelivery(service, project, row, state);
      processed += 1;
    } catch (error) {
      console.error(`snag-delivery-worker request=${row.id} failed:`, error);
    }
  }

  return new Response(JSON.stringify({ processed, pending: rows.length - processed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * snag-relay — multi-tenant backend for the Snag web SDK.
 *
 * Public (no JWT verification): host apps may be reachable logged-out.
 * Security boundary = project key resolution + per-project rate limits + origin allowlist.
 *
 * GET  → { enabled, requester_followups_enabled, agent_mode, requests? }
 * POST create  → { prompt, context, … } — insert + launch agent
 * POST reply   → { request_id, reply } — follow-up on existing agent, or plan changes at awaiting_requester
 * POST confirm → { request_id, decision, feedback? } — requester verdict on a plan (approve_plan) or a preview
 *
 * Never log prompt or screenshot contents — log entity ids and reasons only.
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cursorProvider,
  userFacingLaunchError,
  resolveSummaryWithConversationFallback,
  resolveTerminalSummary,
  summaryNeedsConversation,
  type AgentImage,
  type AgentProvider,
} from "../_shared/agent_provider.ts";
import { decryptSecret, getEncryptionSecret } from "../_shared/crypto.ts";
import {
  implementingReplyWrapper,
  planAdjustmentWrapper,
  planningInstructions,
  planningReplyWrapper,
  previewFeedbackPrompt,
  scopeInstructions,
} from "../_shared/execute_prompts.ts";
import {
  claimTransition,
  continueAfterRequesterApproval,
  handleAgentTerminal,
  type LifecycleRow,
  REQUEST_LIFECYCLE_COLUMNS,
} from "../_shared/lifecycle.ts";
import { checkOriginAllowlist, corsAllowOrigin, corsPreflightAllowOrigin } from "../_shared/origins.ts";
import {
  type AgentMode,
  decryptProjectSecret,
  PROJECT_SELECT,
  type ProjectRow,
  projectSettings,
} from "../_shared/projects.ts";
import {
  MARKER_CONTEXT_KEY,
  markerFromContext,
  requestMarkerSchema,
} from "../_shared/request_marker.ts";
import { requestStageLabel } from "../_shared/request_stage.ts";
import {
  mapTerminalRequestStatus,
  requesterQuestionsFormatLines,
} from "../_shared/requester_questions.ts";
import { verifyRequesterToken } from "../_shared/requester_token.ts";
import {
  formatSelectedElements,
  type SelectedElement,
  selectedElementsSchema,
} from "../_shared/selected_elements.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const LIST_LIMIT = 20;
const STALE_RUNNING_MS = 30 * 1000;
const MAX_CONTEXT_JSON_LENGTH = 4000;
const MAX_SCREENSHOT_BASE64_LENGTH = 2_800_000;

const CORS_BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-snag-key, x-snag-requester, x-snag-requester-token, x-snag-app-id",
};

function buildPreflightCorsHeaders(req: Request): Record<string, string> {
  const headers = { ...CORS_BASE_HEADERS };
  const allowOrigin = corsPreflightAllowOrigin(
    req.headers.get("origin"),
    req.headers.get("referer"),
  );
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function buildCorsHeaders(req: Request, allowedOrigins: string[]): Record<string, string> {
  const allowOrigin = corsAllowOrigin(
    req.headers.get("origin"),
    req.headers.get("referer"),
    allowedOrigins,
  );
  const headers = { ...CORS_BASE_HEADERS };
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
    if (allowOrigin !== "*") {
      headers["Vary"] = "Origin";
    }
  }
  return headers;
}

const MAX_REQUESTER_LENGTH = 128;
const REQUESTER_PATTERN = /^[\x20-\x7E]+$/;

const createSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  context: z.record(z.unknown()).default({}),
  screenshot: z
    .object({
      base64: z.string().min(1).max(MAX_SCREENSHOT_BASE64_LENGTH),
      width: z.number().int().positive().max(4000),
      height: z.number().int().positive().max(8000),
    })
    .optional(),
  elements: selectedElementsSchema.optional(),
  marker: requestMarkerSchema.optional(),
  locale: z.string().max(10).optional(),
});

const replySchema = z.object({
  request_id: z.string().uuid(),
  reply: z.string().trim().min(1).max(2000),
});

const confirmSchema = z.discriminatedUnion("decision", [
  z.object({
    request_id: z.string().uuid(),
    decision: z.literal("approve_plan"),
  }),
  z.object({
    request_id: z.string().uuid(),
    decision: z.literal("looks_right"),
  }),
  z.object({
    request_id: z.string().uuid(),
    decision: z.literal("not_right"),
    feedback: z.string().trim().min(1).max(2000),
  }),
]);

function resolveEffectiveAgentMode(project: ProjectRow): AgentMode {
  return projectSettings(project).agentMode;
}

function projectFollowupsEnabled(project: ProjectRow): boolean {
  return projectSettings(project).followupsEnabled;
}

function json(
  body: Record<string, unknown>,
  status = 200,
  corsHeaders: Record<string, string> = CORS_BASE_HEADERS,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildPreflightCorsHeaders(req),
    });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const publishableKey = req.headers.get("x-snag-key");
  if (!publishableKey) {
    return json({ enabled: false }, 403);
  }

  try {
    const serviceClient = createServiceClient();
    const project = await resolveProject(serviceClient, publishableKey);
    if (!project) {
      return json({ enabled: false }, 403);
    }

    const corsHeaders = buildCorsHeaders(req, project.allowed_origins ?? []);
    const originRejected = checkOriginAllowlist(
      req.headers.get("origin"),
      req.headers.get("referer"),
      req.headers.get("x-snag-app-id"),
      project.allowed_origins ?? [],
    );
    if (originRejected) {
      console.warn(`snag-relay rejected: ${originRejected} project=${project.id}`);
      if (req.method === "GET") {
        return json({ enabled: false }, 403, corsHeaders);
      }
      return json({ error: "Origin not allowed" }, 403, corsHeaders);
    }

    const cursorApiKey = await decryptSecret(
      project.cursor_api_key_encrypted,
      getEncryptionSecret(),
    );
    const provider = cursorProvider({ apiKey: cursorApiKey });
    const followupsEnabled = projectFollowupsEnabled(project);

    if (req.method === "GET") {
      const requests = await listRequests(serviceClient, provider, project);
      return json(
        {
          enabled: true,
          requester_followups_enabled: followupsEnabled,
          agent_mode: resolveEffectiveAgentMode(project),
          requests,
        },
        200,
        corsHeaders,
      );
    }

    const rawBody = await req.json();
    if (
      rawBody && typeof rawBody === "object" && "request_id" in rawBody &&
      "decision" in rawBody
    ) {
      return await handleConfirm(
        req,
        confirmSchema.parse(rawBody),
        serviceClient,
        provider,
        project,
        corsHeaders,
      );
    }
    if (rawBody && typeof rawBody === "object" && "request_id" in rawBody) {
      return await handleReply(
        req,
        replySchema.parse(rawBody),
        serviceClient,
        provider,
        project,
        corsHeaders,
      );
    }

    return await handleCreate(
      req,
      createSchema.parse(rawBody),
      serviceClient,
      provider,
      project,
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn("snag-relay rejected: validation");
      return json({ error: "Invalid request" }, 422);
    }
    console.error("snag-relay error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});

async function resolveProject(
  serviceClient: SupabaseClient,
  publishableKey: string,
): Promise<ProjectRow | null> {
  const { data, error } = await serviceClient
    .from("snag_projects")
    .select(PROJECT_SELECT)
    .eq("publishable_key", publishableKey)
    .eq("enabled", true)
    .maybeSingle();

  if (error) {
    console.error("snag-relay project lookup failed:", error);
    return null;
  }
  return (data as ProjectRow | null) ?? null;
}

async function handleCreate(
  req: Request,
  body: z.infer<typeof createSchema>,
  serviceClient: SupabaseClient,
  provider: AgentProvider,
  project: ProjectRow,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (JSON.stringify(body.context).length > MAX_CONTEXT_JSON_LENGTH) {
    console.warn("snag-relay rejected: context_too_large");
    return json({ error: "Context too large" }, 422, corsHeaders);
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const limited = await checkRateLimits(serviceClient, project, ip);
  if (limited) {
    console.warn(`snag-relay rejected: ${limited} project=${project.id}`);
    return json({ error: "Rate limited" }, 429, corsHeaders);
  }

  const { requester, verified } = await resolveRequesterIdentity(req, project);
  const followupsEnabled = projectFollowupsEnabled(project);
  const agentMode = resolveEffectiveAgentMode(project);

  const { data: row, error: insertError } = await serviceClient
    .from("snag_requests")
    .insert({
      project_id: project.id,
      requester,
      requester_verified: verified,
      requester_ip: ip,
      prompt: body.prompt,
      context: {
        ...body.context,
        ...(body.elements?.length ? { snag_elements: body.elements } : {}),
        ...(body.marker ? { [MARKER_CONTEXT_KEY]: body.marker } : {}),
      },
      screenshot_included: !!body.screenshot,
      status: "queued",
      phase: agentMode === "execute" ? "planning" : null,
      phase_started_at: agentMode === "execute" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    console.error("snag-relay insert failed:", insertError);
    return json({ error: "Could not save request" }, 500, corsHeaders);
  }

  try {
    const images: AgentImage[] = body.screenshot
      ? [
          {
            base64: body.screenshot.base64,
            width: body.screenshot.width,
            height: body.screenshot.height,
          },
        ]
      : [];

    const webhookSecret = Deno.env.get("SNAG_WEBHOOK_SECRET");
    const task = await provider.createTask({
      prompt: buildAgentPrompt(
        body.prompt,
        body.context,
        body.elements,
        body.locale,
        project.prompt_instructions,
        agentMode,
        followupsEnabled,
        projectSettings(project).planReviewEnabled,
      ),
      images,
      repository: project.repo_url,
      ref: project.repo_ref,
      model: project.model ?? undefined,
      webhook: webhookSecret
        ? {
            url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook`,
            secret: webhookSecret,
          }
        : undefined,
    });

    await serviceClient
      .from("snag_requests")
      .update({
        agent_id: task.id,
        agent_url: task.url,
        status: task.status === "queued" ? "running" : task.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    return json({ id: row.id, agent_url: task.url }, 200, corsHeaders);
  } catch (error) {
    console.error("snag-relay agent launch failed:", error);
    const message = userFacingLaunchError(error);
    await serviceClient
      .from("snag_requests")
      .update({
        status: "error",
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return json({ error: message }, 502, corsHeaders);
  }
}

async function handleReply(
  req: Request,
  body: z.infer<typeof replySchema>,
  serviceClient: SupabaseClient,
  provider: AgentProvider,
  project: ProjectRow,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const limited = await checkRateLimits(serviceClient, project, ip);
  if (limited) {
    console.warn(`snag-relay reply rejected: ${limited} project=${project.id}`);
    return json({ error: "Rate limited" }, 429, corsHeaders);
  }

  const row = await loadOwnedRequest(req, serviceClient, project, body.request_id, ip);
  if (row instanceof Response) return withCors(row, corsHeaders);

  // Asking for plan changes is part of plan review, which works without follow-ups.
  const adjustingPlan = row.status === "awaiting_requester";
  if (!adjustingPlan && !projectFollowupsEnabled(project)) {
    return json({ error: "Requester follow-ups are disabled" }, 403, corsHeaders);
  }

  if (row.status !== "needs_input" && !adjustingPlan) {
    return json({ error: "Request is not waiting for a reply" }, 409, corsHeaders);
  }

  if (!row.agent_id) {
    return json({ error: "Request has no agent" }, 409, corsHeaders);
  }

  const wrappedReply = adjustingPlan
    ? planAdjustmentWrapper(body.reply)
    : row.phase === "planning"
    ? planningReplyWrapper(body.reply)
    : row.phase === "implementing"
    ? implementingReplyWrapper(body.reply)
    : [
      "The original requester answered your open questions via Snag:",
      "",
      body.reply,
      "",
      "Continue with this clarification.",
      'If you are still blocked on product/UX/scope decisions, list remaining questions under "## Questions for requester" at the top of your summary.',
      "Use the same format as before: Markdown bullets plus the fenced JSON block.",
      'Put technical notes under "## Notes for developers".',
      "If no further requester questions remain, omit the requester heading.",
    ].join("\n");

  const claimed = await claimTransition(serviceClient, row, {
    status: "running",
    error: null,
    plan_summary: row.summary,
    phase_started_at: new Date().toISOString(),
  });
  if (!claimed) {
    return json({ error: "Request changed; refresh and try again" }, 409, corsHeaders);
  }

  try {
    await provider.followUp(row.agent_id, wrappedReply);
  } catch (error) {
    console.error("snag-relay follow-up failed:", error);
    const message = userFacingLaunchError(error);
    await claimTransition(serviceClient, row, {
      status: adjustingPlan ? "awaiting_requester" : "needs_input",
      error: message,
    });
    return json({ error: message }, 502, corsHeaders);
  }

  return json({ id: row.id, status: "running" }, 200, corsHeaders);
}

async function handleConfirm(
  req: Request,
  body: z.infer<typeof confirmSchema>,
  serviceClient: SupabaseClient,
  provider: AgentProvider,
  project: ProjectRow,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const limited = await checkRateLimits(serviceClient, project, ip);
  if (limited) {
    console.warn(`snag-relay confirm rejected: ${limited} project=${project.id}`);
    return json({ error: "Rate limited" }, 429, corsHeaders);
  }

  const row = await loadOwnedRequest(req, serviceClient, project, body.request_id, ip);
  if (row instanceof Response) return withCors(row, corsHeaders);

  if (body.decision === "approve_plan") {
    if (row.status !== "awaiting_requester") {
      return json({ error: "Request is not waiting for plan approval" }, 409, corsHeaders);
    }
    const version = row.lifecycle_version;
    await continueAfterRequesterApproval(
      { service: serviceClient, provider, project },
      row,
    );
    if (row.lifecycle_version === version) {
      return json({ error: "Request changed; refresh and try again" }, 409, corsHeaders);
    }
    return json({ id: row.id, status: row.status }, 200, corsHeaders);
  }

  if (row.status !== "awaiting_confirmation" || row.phase !== "delivering") {
    return json({ error: "Request is not waiting for confirmation" }, 409, corsHeaders);
  }

  if (body.decision === "looks_right") {
    const claimed = await claimTransition(serviceClient, row, {
      status: "running",
      confirmed_at: new Date().toISOString(),
    });
    if (!claimed) {
      return json({ error: "Request changed; refresh and try again" }, 409, corsHeaders);
    }
    return json({ id: row.id, status: "running" }, 200, corsHeaders);
  }

  if (!row.agent_id) {
    return json({ error: "Request has no agent" }, 409, corsHeaders);
  }

  const claimed = await claimTransition(serviceClient, row, {
    status: "running",
    phase: "implementing",
    phase_started_at: new Date().toISOString(),
    preview_url: null,
    confirmed_at: null,
    plan_summary: row.summary,
  });
  if (!claimed) {
    return json({ error: "Request changed; refresh and try again" }, 409, corsHeaders);
  }

  try {
    await provider.followUp(row.agent_id, previewFeedbackPrompt(body.feedback));
  } catch (error) {
    console.error("snag-relay preview feedback failed:", error);
    const message = userFacingLaunchError(error);
    await claimTransition(serviceClient, row, { status: "error", error: message });
    return json({ error: message }, 502, corsHeaders);
  }

  return json({ id: row.id, status: "running" }, 200, corsHeaders);
}

function withCors(response: Response, corsHeaders: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Load a request and check the caller filed it. Requests filed with a verified
 * requester token can only be acted on with a valid token for the same id.
 */
async function loadOwnedRequest(
  req: Request,
  serviceClient: SupabaseClient,
  project: ProjectRow,
  requestId: string,
  ip: string,
): Promise<LifecycleRow | Response> {
  const { data, error } = await serviceClient
    .from("snag_requests")
    .select(REQUEST_LIFECYCLE_COLUMNS)
    .eq("id", requestId)
    .eq("project_id", project.id)
    .maybeSingle();

  if (error || !data) {
    return json({ error: "Request not found" }, 404);
  }
  const row = data as LifecycleRow;

  const identity = await resolveRequesterIdentity(req, project);
  if (row.requester_verified) {
    if (!identity.verified || identity.requester !== row.requester) {
      return json({ error: "Forbidden" }, 403);
    }
  } else if (row.requester) {
    if (!identity.requester || identity.requester !== row.requester) {
      return json({ error: "Forbidden" }, 403);
    }
  } else if (row.requester_ip && row.requester_ip !== ip) {
    return json({ error: "Forbidden" }, 403);
  }
  return row;
}

async function checkRateLimits(
  serviceClient: SupabaseClient,
  project: ProjectRow,
  ip: string,
): Promise<string | null> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [ipHour, projectHour, projectDay] = await Promise.all([
    countSince(serviceClient, project.id, hourAgo, ip),
    countSince(serviceClient, project.id, hourAgo),
    countSince(serviceClient, project.id, dayAgo),
  ]);

  if (ipHour >= project.per_ip_hourly_limit) return "rate_limited_ip_hourly";
  if (projectHour >= project.hourly_limit) return "rate_limited_project_hourly";
  if (projectDay >= project.daily_limit) return "rate_limited_project_daily";
  return null;
}

async function countSince(
  serviceClient: SupabaseClient,
  projectId: string,
  sinceIso: string,
  ip?: string,
): Promise<number> {
  let query = serviceClient
    .from("snag_requests")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .gte("created_at", sinceIso);
  if (ip) query = query.eq("requester_ip", ip);
  const { count, error } = await query;
  if (error) {
    console.error("snag-relay rate-limit count failed:", error);
    return Number.MAX_SAFE_INTEGER;
  }
  return count ?? 0;
}

function resolveOptionalRequester(req: Request): string | null {
  const raw = req.headers.get("x-snag-requester");
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_REQUESTER_LENGTH) return null;
  if (!REQUESTER_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * A valid `x-snag-requester-token` (signed by the host backend with the
 * project's requester secret) wins over the self-reported `x-snag-requester`.
 */
async function resolveRequesterIdentity(
  req: Request,
  project: ProjectRow,
): Promise<{ requester: string | null; verified: boolean }> {
  const headerRequester = resolveOptionalRequester(req);
  const token = req.headers.get("x-snag-requester-token");
  if (token && project.requester_signing_secret_encrypted) {
    const secret = await decryptProjectSecret(project.requester_signing_secret_encrypted);
    const subject = secret ? await verifyRequesterToken(token, secret) : null;
    if (subject) return { requester: subject, verified: true };
    console.warn(`snag-relay requester token rejected project=${project.id}`);
  }
  return { requester: headerRequester, verified: false };
}

async function listRequests(
  serviceClient: SupabaseClient,
  provider: AgentProvider,
  project: ProjectRow,
) {
  const followupsEnabled = projectFollowupsEnabled(project);
  const { data: rows, error } = await serviceClient
    .from("snag_requests")
    .select(`${REQUEST_LIFECYCLE_COLUMNS}, error, rejection_note, context, created_at`)
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    console.error("snag-relay list failed:", error);
    throw error;
  }

  const requests = (rows ?? []) as Array<
    LifecycleRow & {
      error: string | null;
      rejection_note: string | null;
      context: unknown;
      created_at: string;
    }
  >;
  const staleCutoff = Date.now() - STALE_RUNNING_MS;
  let conversationBackfills = 0;
  const MAX_CONVERSATION_BACKFILLS = 3;

  for (const row of requests) {
    if (!row.agent_id) continue;

    const isActive = (row.status === "queued" || row.status === "running") &&
      row.phase !== "delivering";
    const needsSummaryBackfill = row.status === "finished" && !row.phase &&
      !(typeof row.summary === "string" && row.summary.trim());

    if (isActive) {
      if (new Date(row.updated_at).getTime() > staleCutoff) continue;

      const task = await provider.getStatus(row.agent_id);
      if (!task) continue;

      if (task.status === "finished" || task.status === "error") {
        const needsConversation = summaryNeedsConversation(task.summary, row.phase);
        if (needsConversation && conversationBackfills >= MAX_CONVERSATION_BACKFILLS) {
          continue;
        }
        if (needsConversation) conversationBackfills += 1;
        const summary = needsConversation
          ? await resolveTerminalSummary(provider, row.agent_id, task.summary, row.phase)
          : task.summary?.trim() || null;
        await handleAgentTerminal({ service: serviceClient, provider, project }, row, {
          status: task.status,
          summary,
          url: task.url,
          branchName: task.branchName,
          prUrl: task.prUrl,
        });
        continue;
      }

      const update: Record<string, unknown> = {
        status: "running",
        updated_at: new Date().toISOString(),
      };
      if (task.url) update.agent_url = task.url;
      if (task.branchName) update.branch_name = task.branchName;
      if (task.prUrl) update.pr_url = task.prUrl;
      Object.assign(row, update);
      await serviceClient
        .from("snag_requests")
        .update(update)
        .eq("id", row.id)
        .eq("lifecycle_version", row.lifecycle_version);
      continue;
    }

    // Backfill finished plan-only rows that never got a Cursor summary (v0 API gap).
    if (
      needsSummaryBackfill &&
      conversationBackfills < MAX_CONVERSATION_BACKFILLS
    ) {
      conversationBackfills += 1;
      const summary = await resolveSummaryWithConversationFallback(
        provider,
        row.agent_id,
        null,
      );
      if (!summary) continue;
      const status = mapTerminalRequestStatus(
        "finished",
        summary,
        followupsEnabled,
      );
      const update = {
        summary,
        status,
        updated_at: new Date().toISOString(),
      };
      Object.assign(row, { summary, status });
      await serviceClient.from("snag_requests").update(update).eq("id", row.id);
    }
  }

  return requests.map((row) => ({
    id: row.id,
    prompt: row.prompt,
    status: row.status,
    agent_url: row.agent_url,
    branch_name: row.branch_name,
    pr_url: row.pr_url,
    preview_url: row.preview_url,
    summary: row.summary,
    error: row.error,
    rejection_note: row.status === "rejected" ? row.rejection_note : null,
    handoff_reason: row.status === "awaiting_review" ? row.handoff_reason : null,
    phase: row.phase,
    stage_label: requestStageLabel(row),
    plan: row.plan
      ? {
        summary: row.plan.summary,
        changes: row.plan.changes ?? [],
        preview: row.plan.preview ?? null,
      }
      : null,
    marker: markerFromContext(row.context),
    requester: row.requester ?? null,
    created_at: row.created_at,
  }));
}

function buildAgentPrompt(
  prompt: string,
  context: Record<string, unknown>,
  elements: SelectedElement[] | undefined,
  locale: string | undefined,
  promptInstructions: string,
  agentMode: AgentMode,
  followupsEnabled: boolean,
  planReviewEnabled: boolean,
): string {
  const elementSections = formatSelectedElements(elements);
  const sections = [
    "An internal tester filed an in-app change request via Snag while using a development/staging build. A screenshot of the exact screen is attached when available.",
    "",
    "## Change request",
    prompt,
    "",
    ...(elementSections.length > 0 ? [...elementSections, ""] : []),
    "## Screen context (captured automatically)",
    "```json",
    JSON.stringify({ ...context, locale: locale ?? context.locale }, null, 2),
    "```",
  ];

  if (promptInstructions.trim()) {
    sections.push("", "## Repo orientation", promptInstructions.trim());
  }

  sections.push(
    "",
    "## Scope",
    ...scopeInstructions(followupsEnabled, agentMode !== "plan_only"),
    "",
    "## Instructions",
  );

  if (agentMode === "plan_only") {
    sections.push(
      "1. Locate the exact code behind this request.",
      "2. Write a structured plan in your summary:",
      "   - Files to change (with paths)",
      "   - Specific edits per file",
      "   - Risks and edge cases",
    );
  } else {
    sections.push(...planningInstructions(followupsEnabled, planReviewEnabled));
    return sections.join("\n");
  }

  if (followupsEnabled) {
    sections.push(
      "",
      "When listing open questions, separate them in your summary as follows:",
      "- Put product/UX/scope decisions only the requester can answer FIRST under exactly this heading:",
      "  ## Questions for requester",
      "  (copy, intent, which variant, edge-case preference). Omit this heading entirely if there are none.",
      ...requesterQuestionsFormatLines(),
      "- Put technical open questions under:",
      "  ## Notes for developers",
      "  (architecture, data model, risks, implementation). Do not put these in the requester section.",
    );
    sections.push(
      "3. DO NOT edit files, commit changes, or open a pull request. This tenant is in plan-only mode — the development team will implement manually.",
      "4. Respect existing conventions when describing the approach.",
    );
  } else {
    sections.push(
      "   - Open questions for the developer",
      "3. DO NOT edit files, commit changes, or open a pull request. This tenant is in plan-only mode — the development team will implement manually.",
      "4. Respect existing conventions when describing the approach.",
    );
  }

  return sections.join("\n");
}

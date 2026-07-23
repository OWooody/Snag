/**
 * snag-relay — multi-tenant backend for the Snag web SDK.
 *
 * Public (no JWT verification): host apps may be reachable logged-out.
 * Security boundary = project key resolution + per-project rate limits.
 *
 * GET  → { enabled, requests? } — SDK visibility probe + request list
 * POST → validate + rate-limit → insert snag_requests row → launch agent
 *
 * Never log prompt or screenshot contents — log entity ids and reasons only.
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cursorProvider,
  userFacingLaunchError,
  type AgentImage,
  type AgentProvider,
} from "../_shared/agent_provider.ts";
import { decryptSecret, getEncryptionSecret } from "../_shared/crypto.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const LIST_LIMIT = 20;
const STALE_RUNNING_MS = 30 * 1000;
const MAX_CONTEXT_JSON_LENGTH = 4000;
const MAX_SCREENSHOT_BASE64_LENGTH = 2_800_000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-snag-key, x-snag-requester",
};

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
  locale: z.string().max(10).optional(),
});

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  publishable_key: string;
  repo_url: string;
  repo_ref: string;
  model: string | null;
  cursor_api_key_encrypted: string;
  prompt_instructions: string;
  enabled: boolean;
  per_ip_hourly_limit: number;
  hourly_limit: number;
  daily_limit: number;
  agent_mode: "plan_only" | "execute" | null;
  snag_organizations: { agent_mode: "plan_only" | "execute" } | null;
}

type AgentMode = "plan_only" | "execute";

function resolveEffectiveAgentMode(project: ProjectRow): AgentMode {
  const orgMode = project.snag_organizations?.agent_mode;
  return project.agent_mode ?? orgMode ?? "plan_only";
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
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

    const cursorApiKey = await decryptSecret(
      project.cursor_api_key_encrypted,
      getEncryptionSecret(),
    );
    const provider = cursorProvider({ apiKey: cursorApiKey });

    if (req.method === "GET") {
      const requests = await listRequests(serviceClient, provider, project.id);
      return json({ enabled: true, requests });
    }

    return await handleCreate(req, serviceClient, provider, project);
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
    .select(
      "id, name, slug, publishable_key, repo_url, repo_ref, model, cursor_api_key_encrypted, prompt_instructions, enabled, per_ip_hourly_limit, hourly_limit, daily_limit, agent_mode, snag_organizations(agent_mode)",
    )
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
  serviceClient: SupabaseClient,
  provider: AgentProvider,
  project: ProjectRow,
): Promise<Response> {
  const body = createSchema.parse(await req.json());

  if (JSON.stringify(body.context).length > MAX_CONTEXT_JSON_LENGTH) {
    console.warn("snag-relay rejected: context_too_large");
    return json({ error: "Context too large" }, 422);
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const limited = await checkRateLimits(serviceClient, project, ip);
  if (limited) {
    console.warn(`snag-relay rejected: ${limited} project=${project.id}`);
    return json({ error: "Rate limited" }, 429);
  }

  const requester = await resolveOptionalRequester(req);

  const { data: row, error: insertError } = await serviceClient
    .from("snag_requests")
    .insert({
      project_id: project.id,
      requester,
      requester_ip: ip,
      prompt: body.prompt,
      context: body.context,
      screenshot_included: !!body.screenshot,
      status: "queued",
    })
    .select("id")
    .single();

  if (insertError || !row) {
    console.error("snag-relay insert failed:", insertError);
    return json({ error: "Could not save request" }, 500);
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
    const agentMode = resolveEffectiveAgentMode(project);
    const task = await provider.createTask({
      prompt: buildAgentPrompt(
        body.prompt,
        body.context,
        body.locale,
        project.prompt_instructions,
        agentMode,
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

    return json({ id: row.id, agent_url: task.url });
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
    return json({ error: message }, 502);
  }
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

async function resolveOptionalRequester(req: Request): Promise<string | null> {
  const raw = req.headers.get("x-snag-requester");
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_REQUESTER_LENGTH) return null;
  if (!REQUESTER_PATTERN.test(trimmed)) return null;
  return trimmed;
}

async function listRequests(
  serviceClient: SupabaseClient,
  provider: AgentProvider,
  projectId: string,
) {
  const { data: rows, error } = await serviceClient
    .from("snag_requests")
    .select(
      "id, prompt, status, agent_id, agent_url, branch_name, pr_url, summary, error, requester, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    console.error("snag-relay list failed:", error);
    throw error;
  }

  const requests = rows ?? [];
  const staleCutoff = Date.now() - STALE_RUNNING_MS;

  for (const row of requests) {
    const isActive = row.status === "queued" || row.status === "running";
    if (!isActive || !row.agent_id) continue;
    if (new Date(row.updated_at as string).getTime() > staleCutoff) continue;

    const task = await provider.getStatus(row.agent_id as string);
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (task) {
      update.status = task.status === "queued" ? "running" : task.status;
      if (task.url) update.agent_url = task.url;
      if (task.branchName) update.branch_name = task.branchName;
      if (task.prUrl) update.pr_url = task.prUrl;
      if (task.summary) update.summary = task.summary;
      Object.assign(row, {
        status: update.status,
        agent_url: task.url ?? row.agent_url,
        branch_name: task.branchName ?? row.branch_name,
        pr_url: task.prUrl ?? row.pr_url,
        summary: task.summary ?? row.summary,
      });
    }
    await serviceClient.from("snag_requests").update(update).eq("id", row.id);
  }

  return requests.map((row) => ({
    id: row.id,
    prompt: row.prompt,
    status: row.status,
    agent_url: row.agent_url,
    branch_name: row.branch_name,
    pr_url: row.pr_url,
    summary: row.summary,
    error: row.error,
    requester: row.requester ?? null,
    created_at: row.created_at,
  }));
}

function buildAgentPrompt(
  prompt: string,
  context: Record<string, unknown>,
  locale: string | undefined,
  promptInstructions: string,
  agentMode: AgentMode,
): string {
  const sections = [
    "An internal tester filed an in-app change request via Snag while using a development/staging build. A screenshot of the exact screen is attached when available.",
    "",
    "## Change request",
    prompt,
    "",
    "## Screen context (captured automatically)",
    "```json",
    JSON.stringify({ ...context, locale: locale ?? context.locale }, null, 2),
    "```",
  ];

  if (promptInstructions.trim()) {
    sections.push("", "## Repo orientation", promptInstructions.trim());
  }

  sections.push("", "## Instructions");

  if (agentMode === "plan_only") {
    sections.push(
      "1. Locate the exact code behind this request.",
      "2. Write a structured plan in your summary:",
      "   - Files to change (with paths)",
      "   - Specific edits per file",
      "   - Risks and edge cases",
      "   - Open questions for the developer",
      "3. DO NOT edit files, commit changes, or open a pull request. This tenant is in plan-only mode — the development team will implement manually.",
      "4. Respect existing conventions when describing the approach.",
    );
  } else {
    sections.push(
      "1. PLAN FIRST: locate the exact code behind the request and write a short plan (files, edits, risks).",
      "2. Implement only if the request is small and unambiguous. If it is vague, conflicting, or touches sensitive data, stop after the plan and list the open questions in your summary instead.",
      "3. Respect existing conventions in the repository.",
      "4. Keep the change minimal — no drive-by refactors.",
    );
  }

  return sections.join("\n");
}

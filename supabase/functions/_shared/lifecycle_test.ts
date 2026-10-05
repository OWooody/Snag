import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AgentProvider } from "./agent_provider.ts";
import {
  continueAfterRequesterApproval,
  handleAgentTerminal,
  type LifecycleRow,
} from "./lifecycle.ts";
import { SNAG_PLAN_HEADING } from "./plan_block.ts";
import type { ProjectRow } from "./projects.ts";

/** Just enough of the supabase-js query builder for lifecycle transitions. */
function fakeService() {
  const updates: Record<string, unknown>[] = [];
  let version = 0;
  const service = {
    from(table: string) {
      const state: { op: "select" | "update"; values?: Record<string, unknown>; version?: unknown } = {
        op: "select",
      };
      const builder = {
        select() {
          return builder;
        },
        update(values: Record<string, unknown>) {
          state.op = "update";
          state.values = values;
          return builder;
        },
        eq(column: string, value: unknown) {
          if (column === "lifecycle_version") state.version = value;
          return builder;
        },
        or() {
          return builder;
        },
        then(resolve: (value: unknown) => void) {
          if (table === "snag_policy_rules") return resolve({ data: [], error: null });
          if (state.op === "update") {
            if (state.version !== version) return resolve({ data: [], error: null });
            version += 1;
            updates.push(state.values!);
            return resolve({ data: [{ id: "req-1" }], error: null });
          }
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  };
  return { service: service as unknown as SupabaseClient, updates };
}

const provider = {
  followUp: () => Promise.resolve(),
} as unknown as AgentProvider;

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "proj-1",
    name: "Demo",
    slug: "demo",
    organization_id: "org-1",
    publishable_key: "snag_pk_x",
    repo_url: "https://github.com/acme/web",
    repo_ref: "main",
    model: null,
    cursor_api_key_encrypted: "x",
    prompt_instructions: "",
    enabled: true,
    per_ip_hourly_limit: 10,
    hourly_limit: 10,
    daily_limit: 30,
    allowed_origins: [],
    agent_mode: "execute",
    requester_followups_enabled: true,
    requester_plan_review_enabled: true,
    execute_delivery: "pr_only",
    default_outcome: "review_before_execution",
    policy_shadow_mode: false,
    github_token_encrypted: null,
    origin_app_id: null,
    origin_installation_id: null,
    origin_app_key_encrypted: null,
    requester_signing_secret_encrypted: null,
    trusted_requesters: [],
    auto_merge_daily_limit: 5,
    auto_merge_acknowledged_at: null,
    snag_organizations: null,
    ...overrides,
  };
}

function row(overrides: Partial<LifecycleRow> = {}): LifecycleRow {
  return {
    id: "req-1",
    project_id: "proj-1",
    prompt: "Make Save stand out",
    status: "running",
    phase: "planning",
    phase_started_at: "2026-10-01T11:50:00Z",
    lifecycle_version: 0,
    agent_id: "agent-1",
    agent_url: null,
    branch_name: null,
    pr_url: null,
    preview_url: null,
    handoff_reason: null,
    summary: null,
    plan: null,
    plan_summary: null,
    policy_decision: null,
    requester: "pm@example.com",
    requester_verified: false,
    requester_ip: null,
    approved_at: null,
    confirmed_at: null,
    merged_at: null,
    updated_at: "2026-10-01T11:50:00Z",
    ...overrides,
  };
}

const PLANNED = [
  "Save uses the secondary style.",
  "",
  SNAG_PLAN_HEADING,
  "```json",
  JSON.stringify({
    files: ["src/settings.tsx"],
    risk: "low",
    flags: [],
    summary: "Use the primary style",
    changes: ["Save turns solid purple"],
  }),
  "```",
].join("\n");

const terminal = (summary: string) => ({
  status: "finished" as const,
  summary,
  url: null,
  branchName: null,
  prUrl: null,
});

Deno.test("plan review pauses at awaiting_requester before policy runs", async () => {
  const { service, updates } = fakeService();
  const request = row();
  await handleAgentTerminal({ service, provider, project: project() }, request, terminal(PLANNED));
  assertEquals(updates.length, 1);
  assertEquals(updates[0].status, "awaiting_requester");
  assertEquals(updates[0].policy_decision, undefined);
  assertEquals(request.plan?.changes, ["Save turns solid purple"]);
});

Deno.test("plan review off goes straight to policy", async () => {
  const { service, updates } = fakeService();
  await handleAgentTerminal(
    { service, provider, project: project({ requester_plan_review_enabled: false }) },
    row(),
    terminal(PLANNED),
  );
  assertEquals(updates[0].status, "awaiting_approval");
});

Deno.test("approving the plan still runs policy, so a developer can be required", async () => {
  const { service, updates } = fakeService();
  const request = row();
  const ctx = { service, provider, project: project() };
  await handleAgentTerminal(ctx, request, terminal(PLANNED));
  await continueAfterRequesterApproval(ctx, request);
  assertEquals(updates.map((update) => update.status), ["awaiting_requester", "awaiting_approval"]);
  assertEquals(request.status, "awaiting_approval");
});

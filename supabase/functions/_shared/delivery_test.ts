import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { advanceDelivery } from "./delivery.ts";
import type { ChecksState, GitHubClient, PullRequestInfo } from "./github.ts";
import type { LifecycleRow } from "./lifecycle.ts";
import type { PolicyStageDecision } from "./policy.ts";
import type { ProjectRow } from "./projects.ts";

const NOW = Date.parse("2026-10-01T12:00:00Z");

/** Just enough of the supabase-js query builder for lifecycle transitions. */
function fakeService(options: { mergedToday?: number } = {}) {
  const updates: Record<string, unknown>[] = [];
  let version = 0;
  const service = {
    from(table: string) {
      const state: { op: "select" | "update"; values?: Record<string, unknown>; filters: Record<string, unknown> } = {
        op: "select",
        filters: {},
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
          state.filters[column] = value;
          return builder;
        },
        gte() {
          return builder;
        },
        or() {
          return builder;
        },
        then(resolve: (value: unknown) => void) {
          if (table === "snag_policy_rules") return resolve({ data: [], error: null });
          if (state.op === "update") {
            if (state.filters.lifecycle_version !== version) {
              return resolve({ data: [], error: null });
            }
            version += 1;
            updates.push(state.values!);
            return resolve({ data: [{ id: "req-1" }], error: null });
          }
          return resolve({ count: options.mergedToday ?? 0, error: null });
        },
      };
      return builder;
    },
  };
  return { service: service as unknown as SupabaseClient, updates };
}

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
    requester_plan_review_enabled: null,
    execute_delivery: "auto_merge",
    default_outcome: "review_before_execution",
    policy_shadow_mode: false,
    github_token_encrypted: "enc",
    origin_app_id: null,
    origin_installation_id: null,
    origin_app_key_encrypted: null,
    requester_signing_secret_encrypted: "enc",
    trusted_requesters: ["pm@example.com"],
    auto_merge_daily_limit: 5,
    auto_merge_acknowledged_at: "2026-09-30T00:00:00Z",
    snag_organizations: null,
    ...overrides,
  };
}

function diffDecision(delivery: "auto_merge" | "preview_confirm"): PolicyStageDecision {
  return {
    stage: "diff",
    computed_outcome: "execute",
    outcome: "execute",
    shadow_outcome: "execute",
    project_shadow: false,
    matched: [],
    reasons: [],
    delivery,
    head_sha: "sha-1",
    evaluated_at: "2026-10-01T11:00:00Z",
  };
}

function row(overrides: Partial<LifecycleRow> = {}): LifecycleRow {
  return {
    id: "req-1",
    project_id: "proj-1",
    prompt: "Fix copy",
    status: "running",
    phase: "delivering",
    phase_started_at: "2026-10-01T11:50:00Z",
    lifecycle_version: 0,
    agent_id: "agent-1",
    agent_url: null,
    branch_name: "cursor/fix-copy",
    pr_url: "https://github.com/acme/web/pull/7",
    preview_url: null,
    handoff_reason: null,
    summary: null,
    plan: { files: ["src/copy.json"], risk: "low", flags: [], summary: null },
    plan_summary: null,
    policy_decision: { diff: diffDecision("auto_merge"), final_outcome: "execute" },
    requester: "pm@example.com",
    requester_verified: true,
    requester_ip: null,
    approved_at: null,
    confirmed_at: null,
    merged_at: null,
    updated_at: "2026-10-01T11:50:00Z",
    ...overrides,
  };
}

function fakeGitHub(options: {
  pr?: Partial<PullRequestInfo>;
  checks?: ChecksState;
  previewUrl?: string | null;
  files?: string[];
}) {
  const calls: string[] = [];
  const client = {
    getPullRequest: () => {
      calls.push("getPullRequest");
      return Promise.resolve({
        number: 7,
        nodeId: "PR_node",
        state: "open",
        merged: false,
        mergeable: true,
        mergeableState: "clean",
        draft: false,
        headSha: "sha-1",
        headRef: "cursor/fix-copy",
        baseRef: "main",
        title: "Fix copy",
        mergeCommitSha: null,
        ...options.pr,
      } as PullRequestInfo);
    },
    getChecksState: () => Promise.resolve(options.checks ?? "success"),
    findPreviewUrl: () => Promise.resolve(options.previewUrl ?? null),
    getPullRequestDiff: () =>
      Promise.resolve({
        files: (options.files ?? ["src/copy.json"]).map((path) => ({
          path,
          status: "modified" as const,
        })),
        linesChanged: 4,
      }),
    markReadyForReview: () => {
      calls.push("markReadyForReview");
      return Promise.resolve();
    },
    squashMerge: () => {
      calls.push("squashMerge");
      return Promise.resolve({ merged: true, sha: "merge-sha" });
    },
  } as unknown as GitHubClient;
  return {
    forge: { host: "github" as const, client, repo: { owner: "acme", repo: "web" } },
    calls,
  };
}

Deno.test("auto_merge merges once CI is green", async () => {
  const { service, updates } = fakeService();
  const { forge, calls } = fakeGitHub({ checks: "success" });
  await advanceDelivery(service, project(), row(), { mergedProjects: new Set() }, NOW, { forge });
  assertEquals(calls.includes("squashMerge"), true);
  assertEquals(updates.at(-1)?.status, "merged");
  assertEquals(updates.at(-1)?.merge_commit_sha, "merge-sha");
});

Deno.test("merges are serialized per project within a run", async () => {
  const { service, updates } = fakeService();
  const { forge, calls } = fakeGitHub({ checks: "success" });
  await advanceDelivery(
    service,
    project(),
    row(),
    { mergedProjects: new Set(["proj-1"]) },
    NOW,
    { forge },
  );
  assertEquals(calls.includes("squashMerge"), false);
  assertEquals(updates.length, 0);
});

Deno.test("failing or missing CI hands the PR to a developer", async () => {
  for (const checks of ["failure", "none"] as const) {
    const { service, updates } = fakeService();
    const { forge, calls } = fakeGitHub({ checks });
    await advanceDelivery(service, project(), row(), { mergedProjects: new Set() }, NOW, { forge });
    assertEquals(calls.includes("squashMerge"), false);
    assertEquals(updates.at(-1)?.status, "awaiting_review");
  }
});

Deno.test("pending CI waits, then times out", async () => {
  const waiting = fakeService();
  await advanceDelivery(
    waiting.service,
    project(),
    row(),
    { mergedProjects: new Set() },
    NOW,
    { forge: fakeGitHub({ checks: "pending" }).forge },
  );
  assertEquals(waiting.updates.length, 0);

  const timedOut = fakeService();
  await advanceDelivery(
    timedOut.service,
    project(),
    row({ phase_started_at: "2026-10-01T10:00:00Z" }),
    { mergedProjects: new Set() },
    NOW,
    { forge: fakeGitHub({ checks: "pending" }).forge },
  );
  assertEquals(timedOut.updates.at(-1)?.status, "awaiting_review");
});

Deno.test("daily auto-merge cap hands off instead of merging", async () => {
  const { service, updates } = fakeService({ mergedToday: 5 });
  const { forge, calls } = fakeGitHub({ checks: "success" });
  await advanceDelivery(service, project(), row(), { mergedProjects: new Set() }, NOW, { forge });
  assertEquals(calls.includes("squashMerge"), false);
  assertEquals(updates.at(-1)?.handoff_reason, "Daily automatic merge limit reached.");
  assertEquals(updates.at(-1)?.error, undefined);
});

Deno.test("preview_confirm waits for a preview, then for the requester", async () => {
  const previewRow = row({
    policy_decision: { diff: diffDecision("preview_confirm"), final_outcome: "execute" },
  });

  const found = fakeService();
  await advanceDelivery(
    found.service,
    project({ execute_delivery: "preview_confirm" }),
    { ...previewRow },
    { mergedProjects: new Set() },
    NOW,
    { forge: fakeGitHub({ previewUrl: "https://preview.example.com" }).forge },
  );
  assertEquals(found.updates.at(-1)?.status, "awaiting_confirmation");
  assertEquals(found.updates.at(-1)?.preview_url, "https://preview.example.com");

  const waiting = fakeService();
  const { forge, calls } = fakeGitHub({ checks: "success" });
  await advanceDelivery(
    waiting.service,
    project({ execute_delivery: "preview_confirm" }),
    { ...previewRow, status: "awaiting_confirmation" },
    { mergedProjects: new Set() },
    NOW,
    { forge },
  );
  assertEquals(waiting.updates.length, 0);
  assertEquals(calls.includes("squashMerge"), false);

  const confirmed = fakeService();
  const merging = fakeGitHub({ checks: "success" });
  await advanceDelivery(
    confirmed.service,
    project({ execute_delivery: "preview_confirm" }),
    { ...previewRow, confirmed_at: "2026-10-01T11:55:00Z" },
    { mergedProjects: new Set() },
    NOW,
    { forge: merging.forge },
  );
  assertEquals(merging.calls.includes("squashMerge"), true);
  assertEquals(confirmed.updates.at(-1)?.status, "merged");
});

Deno.test("new commits outside the plan send the PR to review and void confirmation", async () => {
  const { service, updates } = fakeService();
  const { forge, calls } = fakeGitHub({
    pr: { headSha: "sha-2" },
    files: ["src/copy.json", "src/payments.ts"],
  });
  await advanceDelivery(
    service,
    project(),
    row({ confirmed_at: "2026-10-01T11:55:00Z" }),
    { mergedProjects: new Set() },
    NOW,
    { forge },
  );
  assertEquals(calls.includes("squashMerge"), false);
  assertEquals(updates.at(-1)?.status, "awaiting_review");
});

Deno.test("developer merges and closes are tracked for handed-off PRs", async () => {
  const merged = fakeService();
  await advanceDelivery(
    merged.service,
    project(),
    row({ status: "awaiting_review" }),
    { mergedProjects: new Set() },
    NOW,
    { forge: fakeGitHub({ pr: { merged: true, state: "closed", mergeCommitSha: "m" } }).forge },
  );
  assertEquals(merged.updates.at(-1)?.status, "merged");

  const closed = fakeService();
  await advanceDelivery(
    closed.service,
    project(),
    row({ status: "awaiting_review" }),
    { mergedProjects: new Set() },
    NOW,
    { forge: fakeGitHub({ pr: { state: "closed" } }).forge },
  );
  assertEquals(closed.updates.at(-1)?.status, "error");
});

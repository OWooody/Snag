import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { projectSettings, type ProjectRow } from "./projects.ts";

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

Deno.test("GitHub keeps preview and auto-merge when a token is saved", () => {
  assertEquals(projectSettings(project({ execute_delivery: "preview_confirm" })).delivery, "preview_confirm");
  assertEquals(projectSettings(project()).delivery, "auto_merge");
});

Deno.test("Origin drops preview delivery and keeps direct merge", () => {
  const origin = {
    repo_url: "https://origin.cursor.com/acme/web",
    origin_app_id: "app_1",
    origin_installation_id: "ins_1",
    origin_app_key_encrypted: "enc",
  };
  assertEquals(
    projectSettings(project({ ...origin, execute_delivery: "preview_confirm" })).delivery,
    "pr_only",
  );
  assertEquals(projectSettings(project(origin)).delivery, "auto_merge");
  assertEquals(
    projectSettings(project({ ...origin, origin_app_key_encrypted: null })).delivery,
    "pr_only",
  );
});

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret, getEncryptionSecret } from "./crypto.ts";
import { type GitHubClient, githubClient, type GitHubRepo, parseRepoUrl } from "./github.ts";
import type { ExecuteDelivery, PolicyOutcome, PolicyRule } from "./policy.ts";
import { resolveEffectiveRequesterFollowups } from "./requester_questions.ts";

export type AgentMode = "plan_only" | "execute";

interface OrganizationSettings {
  agent_mode: AgentMode;
  requester_followups_enabled: boolean;
  execute_delivery: ExecuteDelivery;
  default_outcome: PolicyOutcome;
  policy_shadow_mode: boolean;
}

export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  organization_id: string | null;
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
  allowed_origins: string[];
  agent_mode: AgentMode | null;
  requester_followups_enabled: boolean | null;
  execute_delivery: ExecuteDelivery | null;
  default_outcome: PolicyOutcome | null;
  policy_shadow_mode: boolean | null;
  github_token_encrypted: string | null;
  requester_signing_secret_encrypted: string | null;
  trusted_requesters: string[];
  auto_merge_daily_limit: number;
  auto_merge_acknowledged_at: string | null;
  snag_organizations: OrganizationSettings | null;
}

export const PROJECT_SELECT =
  "id, name, slug, organization_id, publishable_key, repo_url, repo_ref, model, cursor_api_key_encrypted, prompt_instructions, enabled, per_ip_hourly_limit, hourly_limit, daily_limit, allowed_origins, agent_mode, requester_followups_enabled, execute_delivery, default_outcome, policy_shadow_mode, github_token_encrypted, requester_signing_secret_encrypted, trusted_requesters, auto_merge_daily_limit, auto_merge_acknowledged_at, snag_organizations(agent_mode, requester_followups_enabled, execute_delivery, default_outcome, policy_shadow_mode)";

export interface ProjectSettings {
  agentMode: AgentMode;
  followupsEnabled: boolean;
  delivery: ExecuteDelivery;
  defaultOutcome: PolicyOutcome;
  shadow: boolean;
}

export function projectSettings(project: ProjectRow): ProjectSettings {
  const org = project.snag_organizations;
  const shadow = typeof project.policy_shadow_mode === "boolean"
    ? project.policy_shadow_mode
    : org?.policy_shadow_mode ?? false;
  return {
    agentMode: project.agent_mode ?? org?.agent_mode ?? "plan_only",
    followupsEnabled: resolveEffectiveRequesterFollowups(
      project.requester_followups_enabled,
      org?.requester_followups_enabled,
    ),
    delivery: effectiveDelivery(project),
    defaultOutcome: project.default_outcome ?? org?.default_outcome ??
      "review_before_execution",
    shadow,
  };
}

/**
 * Configured delivery, downgraded to pr_only when the project is missing what
 * that delivery needs (GitHub token; for auto_merge also the requester signing
 * secret and the admin acknowledgement).
 */
function effectiveDelivery(project: ProjectRow): ExecuteDelivery {
  const configured = project.execute_delivery ??
    project.snag_organizations?.execute_delivery ?? "pr_only";
  if (configured === "pr_only") return configured;
  if (!project.github_token_encrypted) {
    console.warn(`snag: ${configured} needs a GitHub token; using pr_only project=${project.id}`);
    return "pr_only";
  }
  if (
    configured === "auto_merge" &&
    (!project.requester_signing_secret_encrypted ||
      !project.auto_merge_acknowledged_at ||
      (project.trusted_requesters ?? []).length === 0)
  ) {
    console.warn(`snag: auto_merge prerequisites missing; using pr_only project=${project.id}`);
    return "pr_only";
  }
  return configured;
}

export async function loadProjectById(
  service: SupabaseClient,
  projectId: string,
): Promise<ProjectRow | null> {
  const { data, error } = await service
    .from("snag_projects")
    .select(PROJECT_SELECT)
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    console.error("snag project lookup failed:", error);
    return null;
  }
  return (data as ProjectRow | null) ?? null;
}

export async function loadPolicyRules(
  service: SupabaseClient,
  project: ProjectRow,
): Promise<PolicyRule[]> {
  if (!project.organization_id) return [];
  const { data, error } = await service
    .from("snag_policy_rules")
    .select("id, name, enabled, shadow, kind, outcome, condition, project_id")
    .eq("organization_id", project.organization_id)
    .or(`project_id.is.null,project_id.eq.${project.id}`);
  if (error) {
    // Fail closed: without rules nothing can be allowed, so the default applies.
    console.error("snag policy rules lookup failed:", error);
    return [];
  }
  return (data ?? []) as PolicyRule[];
}

export async function decryptProjectSecret(
  encrypted: string | null,
): Promise<string | null> {
  if (!encrypted) return null;
  try {
    return await decryptSecret(encrypted, getEncryptionSecret());
  } catch (error) {
    console.error("snag secret decrypt failed:", error);
    return null;
  }
}

export async function projectGitHub(
  project: ProjectRow,
): Promise<{ client: GitHubClient; repo: GitHubRepo } | null> {
  const repo = parseRepoUrl(project.repo_url);
  if (!repo) return null;
  const token = await decryptProjectSecret(project.github_token_encrypted);
  if (!token) return null;
  return { client: githubClient({ token }), repo };
}

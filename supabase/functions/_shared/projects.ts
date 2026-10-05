import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret, getEncryptionSecret } from "./crypto.ts";
import {
  type ForgeClient,
  type ForgeHost,
  type ForgeRepo,
  forgeHostFromRepoUrl,
  parseForgeRepoUrl,
} from "./forge.ts";
import { githubClient } from "./github.ts";
import { mintOriginInstallationToken, originClient } from "./origin.ts";
import type { ExecuteDelivery, PolicyOutcome, PolicyRule } from "./policy.ts";
import { resolveEffectiveRequesterFollowups } from "./requester_questions.ts";

export type AgentMode = "plan_only" | "execute";

interface OrganizationSettings {
  agent_mode: AgentMode;
  requester_followups_enabled: boolean;
  requester_plan_review_enabled: boolean;
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
  requester_plan_review_enabled: boolean | null;
  execute_delivery: ExecuteDelivery | null;
  default_outcome: PolicyOutcome | null;
  policy_shadow_mode: boolean | null;
  github_token_encrypted: string | null;
  origin_app_id: string | null;
  origin_installation_id: string | null;
  origin_app_key_encrypted: string | null;
  requester_signing_secret_encrypted: string | null;
  trusted_requesters: string[];
  auto_merge_daily_limit: number;
  auto_merge_acknowledged_at: string | null;
  snag_organizations: OrganizationSettings | null;
}

export const PROJECT_SELECT =
  "id, name, slug, organization_id, publishable_key, repo_url, repo_ref, model, cursor_api_key_encrypted, prompt_instructions, enabled, per_ip_hourly_limit, hourly_limit, daily_limit, allowed_origins, agent_mode, requester_followups_enabled, requester_plan_review_enabled, execute_delivery, default_outcome, policy_shadow_mode, github_token_encrypted, origin_app_id, origin_installation_id, origin_app_key_encrypted, requester_signing_secret_encrypted, trusted_requesters, auto_merge_daily_limit, auto_merge_acknowledged_at, snag_organizations(agent_mode, requester_followups_enabled, requester_plan_review_enabled, execute_delivery, default_outcome, policy_shadow_mode)";

export interface ProjectSettings {
  agentMode: AgentMode;
  followupsEnabled: boolean;
  /** Plans wait at awaiting_requester for the requester to approve them. */
  planReviewEnabled: boolean;
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
    planReviewEnabled: typeof project.requester_plan_review_enabled === "boolean"
      ? project.requester_plan_review_enabled
      : org?.requester_plan_review_enabled ?? false,
    delivery: effectiveDelivery(project),
    defaultOutcome: project.default_outcome ?? org?.default_outcome ??
      "review_before_execution",
    shadow,
  };
}

/**
 * Configured delivery, downgraded to pr_only when the project is missing what
 * that delivery needs. Origin has no preview deployments, so preview_confirm
 * falls back too. auto_merge also needs the requester signing secret and the
 * admin acknowledgement.
 */
function effectiveDelivery(project: ProjectRow): ExecuteDelivery {
  const configured = project.execute_delivery ??
    project.snag_organizations?.execute_delivery ?? "pr_only";
  if (configured === "pr_only") return configured;
  const host = forgeHostFromRepoUrl(project.repo_url);
  if (host === "origin" && configured === "preview_confirm") {
    console.warn(
      `snag: preview_confirm is not available for Origin; using pr_only project=${project.id}`,
    );
    return "pr_only";
  }
  if (!forgeCredentialConfigured(project, host)) {
    const credential = host === "origin" ? "an Origin app" : "a GitHub token";
    console.warn(`snag: ${configured} needs ${credential}; using pr_only project=${project.id}`);
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

function forgeCredentialConfigured(project: ProjectRow, host: ForgeHost | null): boolean {
  if (host === "origin") {
    return Boolean(
      project.origin_app_id &&
        project.origin_installation_id &&
        project.origin_app_key_encrypted,
    );
  }
  return Boolean(project.github_token_encrypted);
}

export interface ForgeConnection {
  host: ForgeHost;
  repo: ForgeRepo;
  client: ForgeClient;
}

/** GitHub token or a freshly minted Origin installation token. Null when unset. */
export async function projectForge(project: ProjectRow): Promise<ForgeConnection | null> {
  const parsed = parseForgeRepoUrl(project.repo_url);
  if (!parsed) return null;
  const repo = { owner: parsed.owner, repo: parsed.repo };
  if (parsed.host === "github") {
    const token = await decryptProjectSecret(project.github_token_encrypted);
    if (!token) return null;
    return { host: "github", repo, client: githubClient({ token }) };
  }
  if (
    !project.origin_app_id ||
    !project.origin_installation_id ||
    !project.origin_app_key_encrypted
  ) {
    return null;
  }
  const privateKeyPem = await decryptProjectSecret(project.origin_app_key_encrypted);
  if (!privateKeyPem) return null;
  const token = await mintOriginInstallationToken({
    appId: project.origin_app_id,
    installationId: project.origin_installation_id,
    privateKeyPem,
  });
  return { host: "origin", repo, client: originClient({ token }) };
}

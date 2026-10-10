import type { AgentMode } from "./agent-mode";
import type {
  ExecuteDelivery,
  PolicyOutcome,
  PolicyRuleCondition,
  PolicyRuleKind,
  SnagPlan,
} from "./execute-policy";

export type SnagRequestStatus =
  | "queued"
  | "running"
  | "finished"
  | "error"
  | "needs_input"
  | "awaiting_requester"
  | "awaiting_approval"
  | "awaiting_review"
  | "awaiting_confirmation"
  | "merged"
  | "rejected";

export type SnagRequestPhase = "planning" | "implementing" | "delivering";

export type OrgMemberRole = "owner" | "admin" | "viewer";

/** Where the host app is deployed. NULL means the checklist stays generic. */
export type HostRuntime = "vercel";

/** How host-app users sign in. NULL means the checklist stays generic. */
export type AuthProvider = "supabase";

/** Columns safe to expose in admin UI and API responses. */
export interface SnagProjectSafe {
  id: string;
  name: string;
  slug: string;
  publishable_key: string;
  repo_url: string;
  repo_ref: string;
  model: string | null;
  prompt_instructions: string;
  enabled: boolean;
  per_ip_hourly_limit: number;
  hourly_limit: number;
  daily_limit: number;
  allowed_origins: string[];
  organization_id: string | null;
  agent_mode: AgentMode | null;
  requester_followups_enabled: boolean | null;
  requester_plan_review_enabled: boolean | null;
  execute_delivery: ExecuteDelivery | null;
  default_outcome: PolicyOutcome | null;
  policy_shadow_mode: boolean | null;
  trusted_requesters: string[];
  auto_merge_daily_limit: number;
  auto_merge_acknowledged_at: string | null;
  github_token_updated_at: string | null;
  origin_app_id: string | null;
  origin_installation_id: string | null;
  origin_credentials_updated_at: string | null;
  requester_secret_updated_at: string | null;
  cursor_key_updated_at: string | null;
  host_runtime: HostRuntime | null;
  auth_provider: AuthProvider | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyMatchedRule {
  id: string;
  name: string;
  kind: PolicyRuleKind | "builtin";
  outcome: PolicyOutcome;
  shadow: boolean;
}

export interface PolicyStageDecision {
  stage: "plan" | "diff";
  /** Outcome the rules produced, before project shadow mode is applied. */
  computed_outcome: PolicyOutcome;
  /** Outcome Snag acted on. */
  outcome: PolicyOutcome;
  /** Outcome if shadow rules were enforced. */
  shadow_outcome: PolicyOutcome;
  project_shadow: boolean;
  matched: PolicyMatchedRule[];
  reasons: string[];
  delivery: ExecuteDelivery;
  head_sha?: string | null;
  evaluated_at: string;
}

export interface PolicyDecisionRecord {
  plan?: PolicyStageDecision;
  diff?: PolicyStageDecision;
  final_outcome?: PolicyOutcome;
  note?: string;
}

export interface SnagRequestRow {
  id: string;
  project_id: string;
  requester: string | null;
  requester_verified: boolean;
  prompt: string;
  status: SnagRequestStatus;
  phase: SnagRequestPhase | null;
  agent_url: string | null;
  branch_name: string | null;
  pr_url: string | null;
  preview_url: string | null;
  summary: string | null;
  error: string | null;
  /** Developer's note when the plan was rejected; shown to the requester. */
  rejection_note: string | null;
  /** Why Snag handed the request to a developer (awaiting_review). */
  handoff_reason: string | null;
  plan: SnagPlan | null;
  policy_decision: PolicyDecisionRecord | null;
  approved_at: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  created_at: string;
  updated_at: string;
}

/** Extra columns the admin request detail page loads for debugging. */
export interface SnagRequestDetailRow extends SnagRequestRow {
  agent_id: string | null;
  context: Record<string, unknown> | null;
  screenshot_included: boolean;
  phase_started_at: string | null;
  confirmed_at: string | null;
}

export interface SnagRequestTransition {
  id: number;
  from_status: SnagRequestStatus | null;
  to_status: SnagRequestStatus;
  phase: SnagRequestPhase | null;
  at: string;
}

export interface SnagRequestAuditEntry {
  id: string;
  action: string;
  actor_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SnagRequestActivity {
  transitions: SnagRequestTransition[];
  audit: SnagRequestAuditEntry[];
}

export interface AgentConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface DurationStats {
  count: number;
  p50_seconds: number | null;
  p90_seconds: number | null;
}

/** Result of the snag_execute_metrics SQL function: aggregates only, no prompts or summaries. */
export interface ExecuteMetrics {
  range_days: number;
  total: number;
  outcomes: Partial<Record<PolicyOutcome | "rejected" | "undecided", number>>;
  merged: { by_snag: number; by_developer: number };
  top_escalations: {
    id: string;
    name: string;
    kind: PolicyRuleKind | "builtin";
    requests: number;
  }[];
  shadow: { decided: number; disagreements: number };
  handoff_reasons: { reason: string; requests: number }[];
  waits: Partial<
    Record<"awaiting_approval" | "awaiting_review" | "awaiting_confirmation", DurationStats>
  >;
  submit_to_merge: DurationStats;
  history_started_at: string | null;
}

/** Where a request ended up, as grouped by the impact metrics. */
export type ImpactOutcome = "merged" | "finished" | "in_progress" | "error" | "rejected";

export interface ImpactHotspot {
  key: string;
  requests: number;
  merged: number;
}

export type ImpactDailyPoint = { day: string } & Record<ImpactOutcome, number>;

/** Result of the snag_impact_metrics SQL function: aggregates only, no prompts or requester ids. */
export interface ImpactMetrics {
  range_days: number;
  since: string;
  total: number;
  outcomes: Partial<Record<ImpactOutcome, number>>;
  funnel: { submitted: number; agent_done: number; pr_opened: number; merged: number };
  daily: ImpactDailyPoint[];
  hotspots: {
    pages: ImpactHotspot[];
    components: ImpactHotspot[];
    files: ImpactHotspot[];
    with_page: number;
    with_elements: number;
  };
  speed: { submit_to_agent_done: DurationStats; submit_to_merge: DurationStats };
  effort: {
    agent_run: DurationStats;
    total_agent_seconds: number;
    tracked_requests: number;
    with_followups: number;
    followup_rounds: number;
  };
  requesters: { active: number };
  history_started_at: string | null;
}

export interface PlatformImpactTenant {
  slug: string;
  name: string;
  enabled: boolean;
  organization_name: string | null;
  total: number;
  pr_opened: number;
  merged: number;
  errored: number;
  rejected: number;
  requesters: number;
  p50_submit_to_merge_seconds: number | null;
  p50_agent_run_seconds: number | null;
  total_agent_seconds: number;
}

/** Result of the snag_platform_impact_metrics SQL function (service role only). */
export interface PlatformImpactMetrics {
  range_days: number;
  since: string;
  totals: {
    requests: number;
    pr_opened: number;
    merged: number;
    errored: number;
    active_tenants: number;
    requesters: number;
    total_agent_seconds: number;
  };
  daily: { day: string; requests: number; merged: number }[];
  tenants: PlatformImpactTenant[];
}

export interface SnagOrganization {
  id: string;
  name: string;
  slug: string;
  agent_mode: AgentMode;
  requester_followups_enabled: boolean;
  requester_plan_review_enabled: boolean;
  execute_delivery: ExecuteDelivery;
  default_outcome: PolicyOutcome;
  policy_shadow_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface SnagPolicyRule {
  id: string;
  organization_id: string;
  project_id: string | null;
  name: string;
  enabled: boolean;
  shadow: boolean;
  kind: PolicyRuleKind;
  condition: PolicyRuleCondition;
  outcome: PolicyOutcome;
  created_at: string;
  updated_at: string;
}

export interface SnagOrgMember {
  id: string;
  organization_id: string;
  user_id: string | null;
  invited_email: string | null;
  role: OrgMemberRole;
  created_at: string;
}

export interface SnagAuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const SAFE_PROJECT_COLUMNS =
  "id, name, slug, publishable_key, repo_url, repo_ref, model, prompt_instructions, enabled, per_ip_hourly_limit, hourly_limit, daily_limit, allowed_origins, organization_id, agent_mode, requester_followups_enabled, requester_plan_review_enabled, execute_delivery, default_outcome, policy_shadow_mode, trusted_requesters, auto_merge_daily_limit, auto_merge_acknowledged_at, github_token_updated_at, origin_app_id, origin_installation_id, origin_credentials_updated_at, requester_secret_updated_at, cursor_key_updated_at, host_runtime, auth_provider, created_at, updated_at" as const;

export const ORGANIZATION_COLUMNS =
  "id, name, slug, agent_mode, requester_followups_enabled, requester_plan_review_enabled, execute_delivery, default_outcome, policy_shadow_mode, created_at, updated_at" as const;

export const POLICY_RULE_COLUMNS =
  "id, organization_id, project_id, name, enabled, shadow, kind, condition, outcome, created_at, updated_at" as const;

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
  | "awaiting_approval"
  | "awaiting_review"
  | "awaiting_confirmation"
  | "merged"
  | "rejected";

export type SnagRequestPhase = "planning" | "implementing" | "delivering";

export type OrgMemberRole = "owner" | "admin" | "viewer";

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
  execute_delivery: ExecuteDelivery | null;
  default_outcome: PolicyOutcome | null;
  policy_shadow_mode: boolean | null;
  trusted_requesters: string[];
  auto_merge_daily_limit: number;
  auto_merge_acknowledged_at: string | null;
  github_token_updated_at: string | null;
  requester_secret_updated_at: string | null;
  cursor_key_updated_at: string | null;
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

export interface SnagOrganization {
  id: string;
  name: string;
  slug: string;
  agent_mode: AgentMode;
  requester_followups_enabled: boolean;
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
  "id, name, slug, publishable_key, repo_url, repo_ref, model, prompt_instructions, enabled, per_ip_hourly_limit, hourly_limit, daily_limit, allowed_origins, organization_id, agent_mode, requester_followups_enabled, execute_delivery, default_outcome, policy_shadow_mode, trusted_requesters, auto_merge_daily_limit, auto_merge_acknowledged_at, github_token_updated_at, requester_secret_updated_at, cursor_key_updated_at, created_at, updated_at" as const;

export const ORGANIZATION_COLUMNS =
  "id, name, slug, agent_mode, requester_followups_enabled, execute_delivery, default_outcome, policy_shadow_mode, created_at, updated_at" as const;

export const POLICY_RULE_COLUMNS =
  "id, organization_id, project_id, name, enabled, shadow, kind, condition, outcome, created_at, updated_at" as const;

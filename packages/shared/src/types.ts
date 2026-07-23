import type { AgentMode } from "./agent-mode";

export type SnagRequestStatus = "queued" | "running" | "finished" | "error";

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
  organization_id: string | null;
  agent_mode: AgentMode | null;
  cursor_key_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SnagRequestRow {
  id: string;
  project_id: string;
  requester: string | null;
  prompt: string;
  status: SnagRequestStatus;
  agent_url: string | null;
  branch_name: string | null;
  pr_url: string | null;
  summary: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SnagOrganization {
  id: string;
  name: string;
  slug: string;
  agent_mode: AgentMode;
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
  "id, name, slug, publishable_key, repo_url, repo_ref, model, prompt_instructions, enabled, per_ip_hourly_limit, hourly_limit, daily_limit, organization_id, agent_mode, cursor_key_updated_at, created_at, updated_at" as const;

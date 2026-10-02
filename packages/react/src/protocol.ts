/**
 * Snag wire contract — the SDK <-> relay protocol.
 *
 * Any backend implementing these shapes works with the SDK unchanged. Field
 * names are intentionally generic: no host-app or vendor specifics beyond the
 * agent link fields, which map cleanly to any cloud coding agent (task URL,
 * branch, PR).
 */

export type SnagRequestStatus =
  | "queued"
  | "running"
  | "finished"
  | "error"
  | "needs_input"
  /** Execute mode: the plan is waiting for a developer's approval. */
  | "awaiting_approval"
  /** Execute mode: the PR is waiting for a developer to review and merge. */
  | "awaiting_review"
  /** Execute mode: the preview is ready; the requester confirms or sends feedback. */
  | "awaiting_confirmation"
  /** Execute mode: Snag merged the PR. */
  | "merged"
  /** Execute mode: a developer rejected the plan; nothing was changed. */
  | "rejected";

export interface SnagScreenshot {
  /** JPEG image data, base64-encoded (no data-URI prefix). */
  base64: string;
  width: number;
  height: number;
}

/** A page element the requester pointed at with the element picker. */
export interface SnagElement {
  /** Short CSS selector; prefers id / data-testid anchors. */
  selector: string;
  /** Lowercase tag name, e.g. "button". */
  tag: string;
  /** Visible text, whitespace-collapsed and truncated. Never form values. */
  text?: string;
  /** Identifying attributes: role, aria-label, href (no query), data-testid, class, ... */
  attributes?: Record<string, string>;
  /** Bounding box in viewport CSS pixels at pick time. */
  rect: { x: number; y: number; width: number; height: number };
  /** Nearest named React component, when discoverable. */
  component?: string;
  /** Named React ancestors, nearest first (includes `component`). */
  componentStack?: string[];
  /** Where the element's JSX was written. Dev builds only; line may be approximate. */
  source?: { file: string; line?: number; column?: number };
}

/** POST <endpoint> — create */
export interface CreateSnagRequestBody {
  /** The user's change request, free text. */
  prompt: string;
  /** Host-provided context: route, locale, app version, environment, ... */
  context: Record<string, unknown>;
  screenshot?: SnagScreenshot;
  /** Elements picked on the page; numbered boxes on the screenshot match this order. */
  elements?: SnagElement[];
  locale?: string;
}

export interface CreateSnagRequestResponse {
  id: string;
  /** Link to the launched agent task, when the provider returns one. */
  agent_url: string | null;
}

/** POST <endpoint> — reply to needs_input */
export interface ReplySnagRequestBody {
  request_id: string;
  reply: string;
}

export interface ReplySnagRequestResponse {
  id: string;
  status: "running";
}

/** POST <endpoint> — answer awaiting_confirmation after checking the preview */
export type ConfirmSnagRequestBody =
  | { request_id: string; decision: "looks_right" }
  | { request_id: string; decision: "not_right"; feedback: string };

export interface ConfirmSnagRequestResponse {
  id: string;
  status: "running";
}

export interface SnagRequestRow {
  id: string;
  prompt: string;
  status: SnagRequestStatus;
  agent_url: string | null;
  branch_name: string | null;
  pr_url: string | null;
  /** Preview deployment for the PR, set while awaiting_confirmation. */
  preview_url?: string | null;
  summary: string | null;
  error: string | null;
  /** The developer's note when the plan was rejected. */
  rejection_note?: string | null;
  /** Why the request went to a developer while awaiting_review. Informational, not an error. */
  handoff_reason?: string | null;
  /** Execute mode: planning, implementing, or delivering. Null in plan-only mode. */
  phase?: "planning" | "implementing" | "delivering" | null;
  /** Short description of an in-progress step, e.g. "Planning" or "Waiting for checks". */
  stage_label?: string | null;
  /** Host-supplied display id from `getRequester`, when provided. */
  requester: string | null;
  created_at: string;
}

/**
 * GET <endpoint> — doubles as the SDK's "am I enabled?" probe. A disabled
 * relay responds 403 with `{ enabled: false }`; the SDK treats any non-200
 * (or network failure) as disabled and never renders the button.
 */
export interface RelayStateResponse {
  enabled: boolean;
  requester_followups_enabled?: boolean;
  agent_mode?: "plan_only" | "execute";
  requests?: SnagRequestRow[];
}

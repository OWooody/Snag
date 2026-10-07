/**
 * Snag wire contract — the SDK <-> relay protocol.
 *
 * Any backend implementing these shapes works with the SDK unchanged. Field
 * names are intentionally generic: no host-app or vendor specifics beyond the
 * agent link fields, which map cleanly to any cloud coding agent (task URL,
 * branch, PR).
 */

export type SnagRequestPhase = "planning" | "implementing" | "delivering";

export type SnagRequestStatus =
  | "queued"
  | "running"
  | "finished"
  | "error"
  | "needs_input"
  /** Execute mode: the plan is waiting for the requester to approve it or ask for changes. */
  | "awaiting_requester"
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

/** An image the requester attached for the agent to use as visual reference. */
export interface SnagReferenceImage {
  /** Original file name, so the agent can tell images apart. */
  name: string;
  /** JPEG image data, base64-encoded (no data-URI prefix). */
  base64: string;
  width: number;
  height: number;
}

/** A text file the requester attached. Contents are inlined into the agent prompt. */
export interface SnagReferenceFile {
  name: string;
  text: string;
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

/** Where on the page a request was filed, for the SDK's page markers. */
export interface SnagRequestMarker {
  /** `location.pathname` when the request was filed. */
  pathname: string;
  /** The first picked element, when one was picked. */
  selector?: string;
  /** Page coordinates in CSS px, used when the selector no longer matches. */
  x: number;
  y: number;
}

/** POST <endpoint> — create */
export interface CreateSnagRequestBody {
  /** The user's change request, free text. */
  prompt: string;
  /** Host-provided context: route, locale, app version, environment, ... */
  context: Record<string, unknown>;
  screenshot?: SnagScreenshot;
  /** Extra images, sent to the agent after the page screenshot as visual reference. */
  images?: SnagReferenceImage[];
  /** Text files inlined into the agent prompt. */
  files?: SnagReferenceFile[];
  /** Elements picked on the page; numbered boxes on the screenshot match this order. */
  elements?: SnagElement[];
  marker?: SnagRequestMarker;
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
  /** Images the agent should use as visual reference for this reply. */
  images?: SnagReferenceImage[];
  files?: SnagReferenceFile[];
}

export interface ReplySnagRequestResponse {
  id: string;
  status: "running";
}

/**
 * POST <endpoint> — approve the plan at awaiting_requester, or answer
 * awaiting_confirmation after checking the preview. Plan changes go through
 * the reply body instead.
 */
export type ConfirmSnagRequestBody =
  | { request_id: string; decision: "approve_plan" }
  | { request_id: string; decision: "looks_right" }
  | {
      request_id: string;
      decision: "not_right";
      feedback: string;
      images?: SnagReferenceImage[];
      files?: SnagReferenceFile[];
    };

export interface ConfirmSnagRequestResponse {
  id: string;
  status: SnagRequestStatus;
}

/** The agent's plan in requester terms. */
export interface SnagRequestPlan {
  summary: string | null;
  /** Plain-language bullets of what will change. */
  changes: string[];
  /** Temporary page edits for an approximate preview. Validated by the SDK before use. */
  preview?: unknown;
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
  phase?: SnagRequestPhase | null;
  /** Short description of an in-progress step, e.g. "Planning" or "Waiting for checks". */
  stage_label?: string | null;
  /** Execute mode: the plan, once the agent has written one. */
  plan?: SnagRequestPlan | null;
  /** Where the request was filed on the page, when known. */
  marker?: SnagRequestMarker | null;
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

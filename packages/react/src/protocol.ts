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
  | "rejected"
  /** The requester closed the request. Snag stops following it. */
  | "closed_by_requester";

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

/** A file the requester attached. Text, PDF, and Office documents are inlined as text. */
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
  /**
   * Nearest Livewire component (dotted name, e.g. `app.filament.resources.user-resource.pages.edit-user`)
   * and its Livewire ancestors, nearest first.
   */
  livewire?: { component: string; stack?: string[] };
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

/**
 * One earlier route or control activation, recorded before the sheet opened.
 * Paths are pathnames only. Labels are short control names, never field values.
 */
export interface SnagFlowStep {
  type: "navigate" | "click";
  path: string;
  label?: string;
}

/** POST <endpoint> — create */
export interface CreateSnagRequestBody {
  /** The user's change request, free text. */
  prompt: string;
  /** Host-provided context: route, locale, app version, environment, ... */
  context: Record<string, unknown>;
  /**
   * Recent route changes and control activations that led to this screen.
   * Omitted when the tester removed them, or when nothing but the current page was seen.
   */
  steps?: SnagFlowStep[];
  screenshot?: SnagScreenshot;
  /** Extra images, sent to the agent after the page screenshot as visual reference. */
  images?: SnagReferenceImage[];
  /** Text files inlined into the agent prompt. */
  files?: SnagReferenceFile[];
  /** Elements picked on the page; numbered boxes on the screenshot match this order. */
  elements?: SnagElement[];
  marker?: SnagRequestMarker;
  locale?: string;
  /**
   * Earlier request this one continues. The new request keeps its own
   * lifecycle; the relay includes the earlier prompt and outcome for the agent.
   */
  continues_request_id?: string;
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

/** POST <endpoint> — requester closes a request that is still open. */
export interface CloseSnagRequestBody {
  request_id: string;
  action: "close";
  /** Optional note shown to developers. */
  note?: string;
}

export interface CloseSnagRequestResponse {
  id: string;
  status: "closed_by_requester";
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
  /** The requester's note when they closed the request. */
  close_note?: string | null;
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
  /** Earlier request this one continues, when it was started as a follow-up. */
  continues_request_id?: string | null;
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

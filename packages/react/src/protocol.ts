/**
 * Snag wire contract — the SDK <-> relay protocol.
 *
 * Any backend implementing these shapes works with the SDK unchanged. Field
 * names are intentionally generic: no host-app or vendor specifics beyond the
 * agent link fields, which map cleanly to any cloud coding agent (task URL,
 * branch, PR).
 */

export type SnagRequestStatus = "queued" | "running" | "finished" | "error";

export interface SnagScreenshot {
  /** JPEG image data, base64-encoded (no data-URI prefix). */
  base64: string;
  width: number;
  height: number;
}

/** POST <endpoint> */
export interface CreateSnagRequestBody {
  /** The user's change request, free text. */
  prompt: string;
  /** Host-provided context: route, locale, app version, environment, ... */
  context: Record<string, unknown>;
  screenshot?: SnagScreenshot;
  locale?: string;
}

export interface CreateSnagRequestResponse {
  id: string;
  /** Link to the launched agent task, when the provider returns one. */
  agent_url: string | null;
}

export interface SnagRequestRow {
  id: string;
  prompt: string;
  status: SnagRequestStatus;
  agent_url: string | null;
  branch_name: string | null;
  pr_url: string | null;
  summary: string | null;
  error: string | null;
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
  requests?: SnagRequestRow[];
}

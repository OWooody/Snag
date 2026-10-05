import { defaultTheme, type SnagTheme } from "./theme";
import { mergeContext, startConsoleErrorBuffer } from "./auto-context";

export interface SnagConfig {
  /** Relay URL implementing the Snag protocol (see protocol.ts). */
  endpoint: string;
  /**
   * Per-project publishable key (`snag_pk_...`). Sent as `x-snag-key` on every
   * request. Identifies the tenant and gates visibility server-side.
   */
  projectKey: string;
  /**
   * Optional bearer token supplier. Called per request; return null when the
   * user is not authenticated (anonymous submissions are allowed — the relay
   * decides what to do with them).
   */
  getAuthToken?: () => Promise<string | null>;
  /**
   * Optional display id for who filed the request (email, username, etc.).
   * Sent as `x-snag-requester` and stored on the request row. Keep it free of
   * secrets — it is shown in the in-app request list.
   */
  getRequester?: () => Promise<string | null> | string | null;
  /**
   * Optional signed requester token from your backend, sent as
   * `x-snag-requester-token`. When it verifies against the project's requester
   * signing secret, its `sub` becomes the verified requester — required for
   * execute-mode auto-merge. Called per request; cache it on your side.
   */
  getRequesterToken?: () => Promise<string | null> | string | null;
  /**
   * Host context attached to every request: current route, locale, app
   * version, environment name, etc. Keep it free of personal data — it is
   * forwarded verbatim to the coding agent. Merged on top of auto-captured
   * `snag_auto` (URL, viewport, user agent, …).
   */
  getContext?: () =>
    | Promise<Record<string, unknown>>
    | Record<string, unknown>;
  /**
   * Pin numbered markers where open requests were filed on the current page.
   * Defaults to true.
   */
  markers?: boolean;
  /** Enable console debug logging. Defaults to non-production. */
  debug?: boolean;
  theme?: Partial<SnagTheme>;
}

let config: SnagConfig | null = null;
const listeners = new Set<() => void>();

export function initSnag(next: SnagConfig): void {
  config = next;
  for (const listener of listeners) listener();
}

export function getSnagConfig(): SnagConfig | null {
  return config;
}

/** Notifies when initSnag runs after the overlay has already mounted. */
export function onSnagInit(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resolveTheme(): SnagTheme {
  return { ...defaultTheme, ...(config?.theme ?? {}) };
}

export async function resolveContext(): Promise<Record<string, unknown>> {
  let host: Record<string, unknown> = {};
  if (config?.getContext) {
    try {
      host = await config.getContext();
    } catch {
      host = {};
    }
  }
  return mergeContext(host);
}

export function isDebugEnabled(): boolean {
  if (config?.debug !== undefined) return config.debug;
  return false;
}

const MAX_REQUESTER_LENGTH = 128;

/** Resolve and sanitize the optional host-supplied requester display id. */
export async function resolveRequester(): Promise<string | null> {
  if (!config?.getRequester) return null;
  try {
    const value = await config.getRequester();
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_REQUESTER_LENGTH) return null;
    return trimmed;
  } catch {
    return null;
  }
}

const MAX_REQUESTER_TOKEN_LENGTH = 1024;

/** Resolve the optional signed requester token; never throws. */
export async function resolveRequesterToken(): Promise<string | null> {
  if (!config?.getRequesterToken) return null;
  try {
    const value = await config.getRequesterToken();
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_REQUESTER_TOKEN_LENGTH) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export { startConsoleErrorBuffer };

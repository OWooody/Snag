import { defaultTheme, type SnagTheme } from "./theme";

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
   * Host context attached to every request: current route, locale, app
   * version, environment name, etc. Keep it free of personal data — it is
   * forwarded verbatim to the coding agent.
   */
  getContext?: () =>
    | Promise<Record<string, unknown>>
    | Record<string, unknown>;
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
  if (!config?.getContext) return {};
  try {
    return await config.getContext();
  } catch {
    return {};
  }
}

export function isDebugEnabled(): boolean {
  if (config?.debug !== undefined) return config.debug;
  return false;
}

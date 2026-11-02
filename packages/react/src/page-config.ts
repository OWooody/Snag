import type { SnagTheme } from "./theme";

export interface SnagPageConfig {
  endpoint: string;
  projectKey: string;
  requester?: string | null;
  context?: Record<string, unknown>;
  markers?: boolean;
  debug?: boolean;
  theme?: Partial<SnagTheme>;
  /** Overlay language. `"ar"` or `ar-*` shows Arabic and RTL. */
  locale?: string;
}

export const CONFIG_ELEMENT_ID = "snag-config";

/** Parse the server-written page config; null when absent or invalid. */
export function readPageConfig(doc: Document = document): SnagPageConfig | null {
  const element = doc.getElementById(CONFIG_ELEMENT_ID);
  if (!element?.textContent) return null;
  try {
    const parsed: unknown = JSON.parse(element.textContent);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<SnagPageConfig>;
    if (typeof value.endpoint !== "string" || !value.endpoint) return null;
    if (typeof value.projectKey !== "string" || !value.projectKey) return null;
    return value as SnagPageConfig;
  } catch {
    return null;
  }
}

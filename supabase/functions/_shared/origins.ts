/** Origin allowlist helpers — keep in sync with packages/shared/src/origins.ts */

const APP_ENTRY_PREFIX = "app://";
const APP_ID_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const MAX_APP_ID_LENGTH = 255;

/** Normalize a native app identifier (iOS bundle ID / Android application ID). */
export function normalizeAppId(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_APP_ID_LENGTH) return null;
  if (!APP_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Normalize an allowlist entry: either a web origin (scheme://host[:port])
 * or a native app entry (app://<bundle-id>).
 */
export function normalizeAllowedEntry(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith(APP_ENTRY_PREFIX)) {
    const appId = normalizeAppId(trimmed.slice(APP_ENTRY_PREFIX.length));
    return appId ? `${APP_ENTRY_PREFIX}${appId}` : null;
  }
  return normalizeOrigin(trimmed);
}

export function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;

    const defaultPort = url.protocol === "https:" ? "443" : "80";
    const port =
      url.port && url.port !== defaultPort ? `:${url.port}` : "";
    return `${url.protocol}//${url.hostname}${port}`;
  } catch {
    return null;
  }
}

function originFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return normalizeOrigin(url.origin);
  } catch {
    return null;
  }
}

function resolveRequestOrigin(
  originHeader: string | null,
  refererHeader: string | null,
): string | null {
  if (originHeader) {
    const normalized = normalizeOrigin(originHeader);
    if (normalized) return normalized;
  }
  return originFromReferer(refererHeader);
}

/** Echo Origin/Referer for OPTIONS preflight. Allowlist is enforced on GET/POST only. */
export function corsPreflightAllowOrigin(
  originHeader: string | null,
  refererHeader: string | null,
): string | null {
  return resolveRequestOrigin(originHeader, refererHeader);
}

function matchesAllowedOrigin(
  requestOrigin: string,
  allowed: string[],
): boolean {
  if (allowed.length === 0) return false;
  const normalized = normalizeAllowedEntry(requestOrigin);
  if (!normalized) return false;
  return allowed.some((entry) => normalizeAllowedEntry(entry) === normalized);
}

/**
 * Resolve the caller identity: browser Origin/Referer first, then the
 * x-snag-app-id header sent by native SDKs (mapped to app://<bundle-id>).
 */
function resolveRequestIdentity(
  originHeader: string | null,
  refererHeader: string | null,
  appIdHeader: string | null,
): string | null {
  const origin = resolveRequestOrigin(originHeader, refererHeader);
  if (origin) return origin;
  if (!appIdHeader) return null;
  const appId = normalizeAppId(appIdHeader);
  return appId ? `app://${appId}` : null;
}

export function checkOriginAllowlist(
  originHeader: string | null,
  refererHeader: string | null,
  appIdHeader: string | null,
  allowed: string[],
): "origin_not_allowed" | null {
  if (allowed.length === 0) return "origin_not_allowed";

  const identity = resolveRequestIdentity(originHeader, refererHeader, appIdHeader);
  if (!identity || !matchesAllowedOrigin(identity, allowed)) {
    return "origin_not_allowed";
  }
  return null;
}

export function corsAllowOrigin(
  originHeader: string | null,
  refererHeader: string | null,
  allowed: string[],
): string | null {
  if (allowed.length === 0) return null;

  const requestOrigin = resolveRequestOrigin(originHeader, refererHeader);
  if (!requestOrigin || !matchesAllowedOrigin(requestOrigin, allowed)) {
    return null;
  }
  return requestOrigin;
}

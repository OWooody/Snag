/** Origin allowlist helpers — keep in sync with packages/shared/src/origins.ts */

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

function matchesAllowedOrigin(
  requestOrigin: string,
  allowed: string[],
): boolean {
  if (allowed.length === 0) return true;
  const normalized = normalizeOrigin(requestOrigin);
  if (!normalized) return false;
  return allowed.some((entry) => normalizeOrigin(entry) === normalized);
}

export function checkOriginAllowlist(
  originHeader: string | null,
  refererHeader: string | null,
  allowed: string[],
): "origin_not_allowed" | null {
  if (allowed.length === 0) return null;

  const requestOrigin = resolveRequestOrigin(originHeader, refererHeader);
  if (!requestOrigin || !matchesAllowedOrigin(requestOrigin, allowed)) {
    return "origin_not_allowed";
  }
  return null;
}

export function corsAllowOrigin(
  originHeader: string | null,
  refererHeader: string | null,
  allowed: string[],
): string | null {
  if (allowed.length === 0) return "*";

  const requestOrigin = resolveRequestOrigin(originHeader, refererHeader);
  if (!requestOrigin || !matchesAllowedOrigin(requestOrigin, allowed)) {
    return null;
  }
  return requestOrigin;
}

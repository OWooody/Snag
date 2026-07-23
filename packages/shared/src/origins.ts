/** Normalize to scheme://host[:port] — no path, no trailing slash. */
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

/** Parse admin textarea: one origin per line, blank lines ignored. */
export function parseOriginsTextarea(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const normalized = normalizeOrigin(line);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

/** Format origins for display in a textarea. */
export function formatOriginsTextarea(origins: string[] | null | undefined): string {
  if (!origins?.length) return "";
  return origins.join("\n");
}

export function originFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return normalizeOrigin(url.origin);
  } catch {
    return null;
  }
}

/** Resolve Origin header, falling back to Referer. */
export function resolveRequestOrigin(
  originHeader: string | null,
  refererHeader: string | null,
): string | null {
  if (originHeader) {
    const normalized = normalizeOrigin(originHeader);
    if (normalized) return normalized;
  }
  return originFromReferer(refererHeader);
}

export function matchesAllowedOrigin(
  requestOrigin: string,
  allowed: string[],
): boolean {
  if (allowed.length === 0) return true;
  const normalized = normalizeOrigin(requestOrigin);
  if (!normalized) return false;
  return allowed.some((entry) => normalizeOrigin(entry) === normalized);
}

/** Returns null if allowed; otherwise a rejection reason. */
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

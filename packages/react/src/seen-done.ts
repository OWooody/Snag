/**
 * Remembers which finished requests the requester has already seen, so the
 * tab only turns green for work that finished since they last looked.
 * Storage can be unavailable (private mode, sandboxed iframes); every access
 * degrades to "nothing new" rather than throwing.
 */

const storageKey = (requester: string | null) => `snag:seen-done:${requester ?? "anonymous"}`;

function readIds(key: string): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string"))
      : null;
  } catch {
    return null;
  }
}

function writeIds(key: string, ids: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Storage full or blocked: the green state just won't persist.
  }
}

/**
 * Number of finished requests not seen yet. The first call for a requester
 * marks everything already finished as seen, so existing users don't get a
 * burst of green for old work.
 */
export function countUnseenDone(requester: string | null, doneIds: string[]): number {
  const key = storageKey(requester);
  const seen = readIds(key);
  if (seen === null) {
    writeIds(key, doneIds);
    return 0;
  }
  return doneIds.filter((id) => !seen.has(id)).length;
}

export function markDoneSeen(requester: string | null, doneIds: string[]): void {
  writeIds(storageKey(requester), doneIds);
}

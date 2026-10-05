import type { SnagRequestRow } from "./protocol";

/** How often to check while an agent is working on a request. */
export const ACTIVE_POLL_MS = 4_000;

export function isActiveRequest(row: SnagRequestRow): boolean {
  return row.status === "queued" || row.status === "running";
}

export function hasActiveRequest(rows: SnagRequestRow[]): boolean {
  return rows.some(isActiveRequest);
}

/** Calls `tick` every `delayMs` while the tab is visible, and once when it becomes visible again. */
export function startVisiblePolling(tick: () => void, delayMs: number): () => void {
  const id = window.setInterval(() => {
    if (!document.hidden) tick();
  }, delayMs);
  const onVisibility = () => {
    if (!document.hidden) tick();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

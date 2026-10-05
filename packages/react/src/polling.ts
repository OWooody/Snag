import type { SnagRequestRow } from "./protocol";

/** How often to check while an agent is working on a request. */
export const ACTIVE_POLL_MS = 4_000;

export function isActiveRequest(row: SnagRequestRow): boolean {
  return row.status === "queued" || row.status === "running";
}

export function hasActiveRequest(rows: SnagRequestRow[]): boolean {
  return rows.some(isActiveRequest);
}

/**
 * Calls `tick` every `delayMs` while the tab is visible, and once when it
 * becomes visible again. `whileHidden` keeps ticking in a background tab;
 * `whileVisible: false` ticks only in the background.
 */
export function startVisiblePolling(
  tick: () => void,
  delayMs: number,
  { whileHidden = false, whileVisible = true }: { whileHidden?: boolean; whileVisible?: boolean } = {},
): () => void {
  const id = window.setInterval(() => {
    if (document.hidden ? whileHidden : whileVisible) tick();
  }, delayMs);
  const onVisibility = () => {
    if (!document.hidden && whileVisible) tick();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/**
 * Tells the requester when one of their requests needs them or is done:
 * an in-page toast, a count in the tab title while the tab is hidden, and a
 * browser notification when they allowed it. Only requests filed from this
 * browser count, so it works the same for anonymous requesters.
 * Storage and the Notification API can be unavailable; every access degrades
 * to "no notification" rather than throwing.
 */

import type { SnagRequestRow, SnagRequestStatus } from "./protocol";

const OWN_KEY = "snag:own-requests";
const ASKED_KEY = "snag:notify-asked";
const MAX_OWN = 100;

export interface StatusEvent {
  row: SnagRequestRow;
  status: SnagRequestStatus;
  title: string;
}

const EVENT_TITLES: Partial<Record<SnagRequestStatus, string>> = {
  needs_input: "The agent has a question for you",
  awaiting_confirmation: "Your change is ready to check",
  finished: "Your request is finished",
  merged: "Your change is live",
  error: "Your request hit a problem",
  rejected: "A developer declined your request",
};

function readOwn(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(OWN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberOwnRequest(id: string): void {
  try {
    const ids = [id, ...readOwn().filter((other) => other !== id)].slice(0, MAX_OWN);
    window.localStorage.setItem(OWN_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: this request just won't notify.
  }
}

let lastStatuses: Map<string, SnagRequestStatus> | null = null;
const listeners = new Set<(event: StatusEvent) => void>();

export function subscribeStatusEvents(listener: (event: StatusEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Compare fresh rows with the previous load and emit an event for each own
 * request that moved into a status worth telling the requester about. The
 * first load only records statuses, so old requests never notify.
 */
export function trackRequestStatuses(rows: SnagRequestRow[]): void {
  const previous = lastStatuses;
  lastStatuses = new Map(rows.map((row) => [row.id, row.status]));
  if (!previous) return;
  const own = new Set(readOwn());
  for (const row of rows) {
    if (!own.has(row.id)) continue;
    const before = previous.get(row.id);
    if (before === undefined || before === row.status) continue;
    const title = EVENT_TITLES[row.status];
    if (!title) continue;
    for (const listener of listeners) listener({ row, status: row.status, title });
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationsGranted(): boolean {
  return notificationsSupported() && Notification.permission === "granted";
}

/** True when the one-time "Notify me" offer should show. */
export function shouldOfferNotifications(): boolean {
  if (!notificationsSupported() || Notification.permission !== "default") return false;
  try {
    return window.localStorage.getItem(ASKED_KEY) == null;
  } catch {
    return false;
  }
}

/** Must be called from a click: browsers only show the prompt after a user action. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    window.localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // Without storage the offer may show again; harmless.
  }
  if (!notificationsSupported()) return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function dismissNotificationOffer(): void {
  try {
    window.localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // Ignore.
  }
}

/** Browser notification, only while the tab is hidden and permission was granted. */
export function showBrowserNotification(event: StatusEvent, onClick: () => void): boolean {
  if (!notificationsSupported() || Notification.permission !== "granted" || !document.hidden) {
    return false;
  }
  try {
    const notification = new Notification(event.title, {
      body: event.row.prompt.slice(0, 140),
      tag: `snag-${event.row.id}`,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      onClick();
    };
    return true;
  } catch {
    return false;
  }
}

const TITLE_PREFIX = /^\(\d+\) /;

/** Prefix the tab title with `(count)`, or remove the prefix when count is 0. */
export function setTitleCount(count: number): void {
  const base = document.title.replace(TITLE_PREFIX, "");
  document.title = count > 0 ? `(${count}) ${base}` : base;
}

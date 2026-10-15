/**
 * Statuses a requester may close. Terminal outcomes (finished, merged, error,
 * rejected, or already closed) stay as they are.
 */
export const REQUESTER_CLOSABLE_STATUSES = [
  "queued",
  "running",
  "needs_input",
  "awaiting_requester",
  "awaiting_approval",
  "awaiting_review",
  "awaiting_confirmation",
] as const;

export const CLOSE_NOTE_MAX = 500;

export function requesterCanClose(status: string): boolean {
  return (REQUESTER_CLOSABLE_STATUSES as readonly string[]).includes(status);
}

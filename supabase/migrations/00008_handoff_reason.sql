-- ============================================================
-- Why Snag handed a request to a developer (CI failed, merge limit reached,
-- no preview, ...) is informational, not a failure. Keep it apart from
-- `error` so requesters don't see it as one.
-- ============================================================

ALTER TABLE snag_requests
  ADD COLUMN IF NOT EXISTS handoff_reason text;

UPDATE snag_requests
SET handoff_reason = error, error = NULL
WHERE status = 'awaiting_review' AND error IS NOT NULL;

COMMENT ON COLUMN snag_requests.handoff_reason IS
  'Why the request moved to awaiting_review instead of continuing automatically. Shown to requesters as information, not as an error.';

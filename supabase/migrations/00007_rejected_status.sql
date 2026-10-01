-- ============================================================
-- Rejected plans get their own status instead of `error`, and the
-- developer's note is kept so the requester can see why.
-- ============================================================

ALTER TABLE snag_requests
  ADD COLUMN IF NOT EXISTS rejection_note text,
  ADD CONSTRAINT snag_requests_rejection_note_length CHECK (
    rejection_note IS NULL OR char_length(rejection_note) <= 2000
  );

ALTER TABLE snag_requests
  DROP CONSTRAINT IF EXISTS snag_requests_status_check;

ALTER TABLE snag_requests
  ADD CONSTRAINT snag_requests_status_check CHECK (
    status IN (
      'queued',
      'running',
      'finished',
      'error',
      'needs_input',
      'awaiting_approval',
      'awaiting_review',
      'awaiting_confirmation',
      'merged',
      'rejected'
    )
  );

UPDATE snag_requests
SET status = 'rejected', error = NULL
WHERE status = 'error' AND error = 'Plan rejected by a developer';

COMMENT ON COLUMN snag_requests.rejection_note IS
  'Optional note from the developer who rejected the plan. Shown to the requester.';

-- ============================================================
-- Requester plan review: in execute mode, the requester can see the
-- agent's plan in plain language and approve it (or ask for changes)
-- before Snag's rules or a developer decide whether it gets built.
-- ============================================================

ALTER TABLE snag_organizations
  ADD COLUMN IF NOT EXISTS requester_plan_review_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE snag_projects
  ADD COLUMN IF NOT EXISTS requester_plan_review_enabled boolean;

COMMENT ON COLUMN snag_organizations.requester_plan_review_enabled IS
  'Default: when true, execute-mode plans wait for the requester to approve them before policy runs.';
COMMENT ON COLUMN snag_projects.requester_plan_review_enabled IS
  'Optional per-project override. NULL inherits snag_organizations.requester_plan_review_enabled.';

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
      'awaiting_requester',
      'awaiting_approval',
      'awaiting_review',
      'awaiting_confirmation',
      'merged',
      'rejected'
    )
  );

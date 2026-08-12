-- Requester follow-ups: per-tenant toggle + needs_input request status.

ALTER TABLE snag_organizations
  ADD COLUMN IF NOT EXISTS requester_followups_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE snag_projects
  ADD COLUMN IF NOT EXISTS requester_followups_enabled boolean;

COMMENT ON COLUMN snag_organizations.requester_followups_enabled IS
  'Default: when true, agents may ask product questions and requesters can reply in-app.';
COMMENT ON COLUMN snag_projects.requester_followups_enabled IS
  'Optional per-project override. NULL inherits snag_organizations.requester_followups_enabled.';

ALTER TABLE snag_requests
  DROP CONSTRAINT IF EXISTS snag_requests_status_check;

ALTER TABLE snag_requests
  ADD CONSTRAINT snag_requests_status_check CHECK (
    status IN ('queued', 'running', 'finished', 'error', 'needs_input')
  );

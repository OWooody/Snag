-- Per-organization Slack incoming webhook. Snag posts when auto-merge is on
-- and a request starts waiting for a developer. The URL is a secret.

ALTER TABLE snag_organizations
  ADD COLUMN IF NOT EXISTS slack_webhook_encrypted text,
  ADD COLUMN IF NOT EXISTS slack_webhook_updated_at timestamptz;

COMMENT ON COLUMN snag_organizations.slack_webhook_encrypted IS
  'Slack incoming webhook URL (AES-256-GCM) for this organization''s workspace. Never returned to clients.';
COMMENT ON COLUMN snag_organizations.slack_webhook_updated_at IS
  'When the Slack webhook was last saved. Null means notifications are off.';

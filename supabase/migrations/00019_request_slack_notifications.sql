-- Outcome of each Slack decision for a request. Written when a request newly
-- starts waiting for a developer. Does not store the webhook URL or message.

ALTER TABLE snag_requests
  ADD COLUMN IF NOT EXISTS slack_notifications jsonb;

COMMENT ON COLUMN snag_requests.slack_notifications IS
  'Slack decisions for this request (sent, failed, or skipped). No webhook URL or message text. Null when nothing was recorded.';

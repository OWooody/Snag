-- Cursor Origin app credentials for execute-mode delivery on origin.cursor.com
-- repositories. The private key is encrypted; the app id and installation id
-- are identifiers the admin panel shows again so a key can be replaced.

ALTER TABLE snag_projects
  ADD COLUMN IF NOT EXISTS origin_app_id text,
  ADD COLUMN IF NOT EXISTS origin_installation_id text,
  ADD COLUMN IF NOT EXISTS origin_app_key_encrypted text,
  ADD COLUMN IF NOT EXISTS origin_credentials_updated_at timestamptz;

COMMENT ON COLUMN snag_projects.origin_app_id IS
  'Origin app id (iss/kid of the app JWT). Not a secret.';
COMMENT ON COLUMN snag_projects.origin_installation_id IS
  'Origin installation id used to mint short-lived access tokens. Not a secret.';
COMMENT ON COLUMN snag_projects.origin_app_key_encrypted IS
  'PKCS#8 Ed25519 private key (AES-256-GCM) for the Origin app. Never returned to clients.';
COMMENT ON COLUMN snag_projects.origin_credentials_updated_at IS
  'When the Origin app id, installation id, and private key were last saved.';

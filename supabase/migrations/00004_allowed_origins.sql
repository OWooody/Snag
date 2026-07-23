-- Per-project browser origin allowlist for relay abuse prevention.
-- Empty array = deny all origins (Snag disabled until origins are configured).

ALTER TABLE snag_projects
  ADD COLUMN allowed_origins text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN snag_projects.allowed_origins IS
  'Allowed browser origins (scheme://host[:port]). Empty = deny all.';

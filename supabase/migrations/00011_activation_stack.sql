-- Where the host app runs, and how its users sign in.
-- These only change activation-checklist wording. Existing RLS on
-- snag_projects already covers the new columns.

ALTER TABLE snag_projects
  ADD COLUMN IF NOT EXISTS host_runtime text,
  ADD COLUMN IF NOT EXISTS auth_provider text,
  ADD CONSTRAINT snag_projects_host_runtime_check CHECK (
    host_runtime IS NULL OR host_runtime IN ('vercel')
  ),
  ADD CONSTRAINT snag_projects_auth_provider_check CHECK (
    auth_provider IS NULL OR auth_provider IN ('supabase')
  );

COMMENT ON COLUMN snag_projects.host_runtime IS
  'Where the host app is deployed. NULL keeps generic activation instructions. vercel names Vercel env vars and preview URLs.';
COMMENT ON COLUMN snag_projects.auth_provider IS
  'How host-app users sign in. NULL keeps generic activation instructions. supabase names Supabase Auth as the requester id.';

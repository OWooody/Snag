-- ============================================================
-- Snag: multi-tenant in-app change requests that launch cloud coding agents
--
-- snag_projects holds per-tenant configuration (repo, agent key, rate limits).
-- snag_requests holds one row per request filed from a host app via the relay.
-- Screenshots are NOT stored — they go to the agent provider at launch only.
-- ============================================================

CREATE TABLE IF NOT EXISTS snag_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  publishable_key text NOT NULL UNIQUE,
  repo_url text NOT NULL,
  repo_ref text NOT NULL DEFAULT 'main',
  model text,
  cursor_api_key_encrypted text NOT NULL,
  prompt_instructions text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  per_ip_hourly_limit integer NOT NULL DEFAULT 10,
  hourly_limit integer NOT NULL DEFAULT 10,
  daily_limit integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT snag_projects_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT snag_projects_publishable_key_format CHECK (
    publishable_key ~ '^snag_pk_[A-Za-z0-9_-]+$'
  ),
  CONSTRAINT snag_projects_rate_limits_positive CHECK (
    per_ip_hourly_limit > 0
    AND hourly_limit > 0
    AND daily_limit > 0
  )
);

CREATE TABLE IF NOT EXISTS snag_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES snag_projects(id) ON DELETE CASCADE,
  requester text,
  requester_ip text,
  prompt text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  screenshot_included boolean NOT NULL DEFAULT false,
  agent_id text,
  agent_url text,
  status text NOT NULL DEFAULT 'queued',
  branch_name text,
  pr_url text,
  summary text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT snag_requests_status_check CHECK (
    status IN ('queued', 'running', 'finished', 'error')
  ),
  CONSTRAINT snag_requests_prompt_length CHECK (
    char_length(prompt) BETWEEN 1 AND 2000
  )
);

CREATE INDEX IF NOT EXISTS idx_snag_projects_publishable_key
  ON snag_projects (publishable_key);

CREATE INDEX IF NOT EXISTS idx_snag_requests_project_created_at
  ON snag_requests (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_snag_requests_agent_id
  ON snag_requests (agent_id);

CREATE INDEX IF NOT EXISTS idx_snag_requests_created_at
  ON snag_requests (created_at DESC);

ALTER TABLE snag_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE snag_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on snag_projects" ON snag_projects
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on snag_requests" ON snag_requests
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE snag_projects IS
  'Snag tenants. Each row configures one host app: repo, encrypted agent API key, rate limits, and prompt instructions.';

COMMENT ON TABLE snag_requests IS
  'Snag change requests. Each row audits one agent launch for a project. Backs relay rate limits.';

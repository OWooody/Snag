-- Agent execution mode: plan-only (default) or allow implementation.

ALTER TABLE snag_organizations
  ADD COLUMN IF NOT EXISTS agent_mode text NOT NULL DEFAULT 'plan_only',
  ADD CONSTRAINT snag_organizations_agent_mode_check CHECK (
    agent_mode IN ('plan_only', 'execute')
  );

ALTER TABLE snag_projects
  ADD COLUMN IF NOT EXISTS agent_mode text,
  ADD CONSTRAINT snag_projects_agent_mode_check CHECK (
    agent_mode IS NULL OR agent_mode IN ('plan_only', 'execute')
  );

COMMENT ON COLUMN snag_organizations.agent_mode IS
  'Default agent behavior for all projects in this org. plan_only = analysis and plan only; execute = may implement small changes.';
COMMENT ON COLUMN snag_projects.agent_mode IS
  'Optional per-project override. NULL inherits snag_organizations.agent_mode.';

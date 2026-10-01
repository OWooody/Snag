-- ============================================================
-- Execute mode policy: rules decide whether a planned change is implemented
-- immediately, waits for a developer to approve the plan, or waits for a
-- developer to review the PR. Delivery decides what happens to PRs that
-- pass: left for developers (pr_only), merged after the requester confirms a
-- preview (preview_confirm), or merged directly (auto_merge).
-- ============================================================

ALTER TABLE snag_organizations
  ADD COLUMN IF NOT EXISTS execute_delivery text NOT NULL DEFAULT 'pr_only',
  ADD COLUMN IF NOT EXISTS default_outcome text NOT NULL DEFAULT 'review_before_execution',
  ADD COLUMN IF NOT EXISTS policy_shadow_mode boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT snag_organizations_execute_delivery_check CHECK (
    execute_delivery IN ('pr_only', 'preview_confirm', 'auto_merge')
  ),
  ADD CONSTRAINT snag_organizations_default_outcome_check CHECK (
    default_outcome IN ('execute', 'review_before_merge', 'review_before_execution')
  );

ALTER TABLE snag_projects
  ADD COLUMN IF NOT EXISTS execute_delivery text,
  ADD COLUMN IF NOT EXISTS default_outcome text,
  ADD COLUMN IF NOT EXISTS policy_shadow_mode boolean,
  ADD COLUMN IF NOT EXISTS github_token_encrypted text,
  ADD COLUMN IF NOT EXISTS github_token_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS requester_signing_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS requester_secret_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS trusted_requesters text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_merge_daily_limit integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS auto_merge_acknowledged_at timestamptz,
  ADD CONSTRAINT snag_projects_execute_delivery_check CHECK (
    execute_delivery IS NULL OR execute_delivery IN ('pr_only', 'preview_confirm', 'auto_merge')
  ),
  ADD CONSTRAINT snag_projects_default_outcome_check CHECK (
    default_outcome IS NULL
    OR default_outcome IN ('execute', 'review_before_merge', 'review_before_execution')
  ),
  ADD CONSTRAINT snag_projects_auto_merge_daily_limit_check CHECK (
    auto_merge_daily_limit > 0 AND auto_merge_daily_limit <= 500
  );

COMMENT ON COLUMN snag_organizations.execute_delivery IS
  'What happens to PRs whose policy outcome is execute: pr_only, preview_confirm, or auto_merge.';
COMMENT ON COLUMN snag_organizations.default_outcome IS
  'Policy outcome when no rule matches.';
COMMENT ON COLUMN snag_organizations.policy_shadow_mode IS
  'When true, policy decisions are recorded but every request waits for developer approval.';
COMMENT ON COLUMN snag_projects.execute_delivery IS
  'Optional per-project override. NULL inherits snag_organizations.execute_delivery.';
COMMENT ON COLUMN snag_projects.default_outcome IS
  'Optional per-project override. NULL inherits snag_organizations.default_outcome.';
COMMENT ON COLUMN snag_projects.policy_shadow_mode IS
  'Optional per-project override. NULL inherits snag_organizations.policy_shadow_mode.';
COMMENT ON COLUMN snag_projects.github_token_encrypted IS
  'Fine-grained GitHub token (AES-256-GCM) used to read PR diffs/checks and merge. Never returned to clients.';
COMMENT ON COLUMN snag_projects.requester_signing_secret_encrypted IS
  'HMAC secret (AES-256-GCM) host backends use to sign x-snag-requester-token. Never returned to clients.';
COMMENT ON COLUMN snag_projects.trusted_requesters IS
  'Verified requester ids allowed to trigger auto_merge.';
COMMENT ON COLUMN snag_projects.auto_merge_acknowledged_at IS
  'When an admin acknowledged that auto_merge ships changes to production without code review.';

-- ============================================================
-- Policy rules
-- ============================================================

CREATE TABLE IF NOT EXISTS snag_policy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES snag_organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES snag_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  shadow boolean NOT NULL DEFAULT false,
  kind text NOT NULL,
  condition jsonb NOT NULL,
  outcome text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT snag_policy_rules_name_length CHECK (char_length(name) BETWEEN 1 AND 128),
  CONSTRAINT snag_policy_rules_kind_check CHECK (kind IN ('allow', 'escalate')),
  CONSTRAINT snag_policy_rules_outcome_check CHECK (
    (kind = 'allow' AND outcome = 'execute')
    OR (kind = 'escalate' AND outcome IN ('review_before_merge', 'review_before_execution'))
  )
);

CREATE INDEX IF NOT EXISTS idx_snag_policy_rules_org
  ON snag_policy_rules (organization_id);

CREATE INDEX IF NOT EXISTS idx_snag_policy_rules_project
  ON snag_policy_rules (project_id);

ALTER TABLE snag_policy_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on snag_policy_rules" ON snag_policy_rules
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Org members can read their policy rules" ON snag_policy_rules
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

COMMENT ON TABLE snag_policy_rules IS
  'Admin-defined execute-mode rules. project_id NULL = applies to every project in the org.';

-- ============================================================
-- Request lifecycle
-- ============================================================

ALTER TABLE snag_requests
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS phase_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifecycle_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan jsonb,
  ADD COLUMN IF NOT EXISTS plan_summary text,
  ADD COLUMN IF NOT EXISTS policy_decision jsonb,
  ADD COLUMN IF NOT EXISTS requester_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preview_url text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz,
  ADD COLUMN IF NOT EXISTS merge_commit_sha text,
  ADD CONSTRAINT snag_requests_phase_check CHECK (
    phase IS NULL OR phase IN ('planning', 'implementing', 'delivering')
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
      'merged'
    )
  );

CREATE INDEX IF NOT EXISTS idx_snag_requests_delivery
  ON snag_requests (status, phase)
  WHERE phase = 'delivering' OR status = 'awaiting_review';

CREATE INDEX IF NOT EXISTS idx_snag_requests_project_merged_at
  ON snag_requests (project_id, merged_at DESC)
  WHERE merged_at IS NOT NULL;

COMMENT ON COLUMN snag_requests.phase IS
  'Execute-mode lifecycle: planning → implementing → delivering. NULL for plan_only requests.';
COMMENT ON COLUMN snag_requests.lifecycle_version IS
  'Optimistic lock: every lifecycle transition increments this so concurrent webhook/poll handlers act once.';
COMMENT ON COLUMN snag_requests.plan_summary IS
  'Agent summary at the end of planning, used to tell a stale finished status apart from the implementation result.';
COMMENT ON COLUMN snag_requests.policy_decision IS
  'Policy evaluation record: plan and diff decisions, matched rules, shadow results, final outcome.';

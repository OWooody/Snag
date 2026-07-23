-- ============================================================
-- Snag Admin: organizations, memberships, platform admins, audit log
-- ============================================================

-- Organizations (companies)
CREATE TABLE IF NOT EXISTS snag_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT snag_organizations_slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

-- Org membership: user_id set after sign-in; invited_email for pending invites
CREATE TABLE IF NOT EXISTS snag_org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES snag_organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text,
  role text NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT snag_org_members_role_check CHECK (role IN ('owner', 'admin', 'viewer')),
  CONSTRAINT snag_org_members_user_or_email CHECK (
    user_id IS NOT NULL OR invited_email IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_snag_org_members_user_org
  ON snag_org_members (organization_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_snag_org_members_invited_email_org
  ON snag_org_members (organization_id, lower(invited_email))
  WHERE invited_email IS NOT NULL AND user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_snag_org_members_user_id
  ON snag_org_members (user_id);

-- Platform-wide admins (Snag operators)
CREATE TABLE IF NOT EXISTS snag_platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit log for sensitive admin actions
CREATE TABLE IF NOT EXISTS snag_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snag_audit_log_target
  ON snag_audit_log (target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_snag_audit_log_actor
  ON snag_audit_log (actor_id, created_at DESC);

-- Link projects to organizations
ALTER TABLE snag_projects
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES snag_organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cursor_key_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_snag_projects_organization_id
  ON snag_projects (organization_id);

-- ============================================================
-- Helper functions for RLS
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM snag_platform_admins
    WHERE user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM snag_org_members
  WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_org_role(p_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM snag_org_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM snag_org_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

-- Link pending org members when a user signs up via magic link
CREATE OR REPLACE FUNCTION public.link_org_members_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE snag_org_members
  SET user_id = NEW.id,
      invited_email = NULL,
      updated_at = now()
  WHERE user_id IS NULL
    AND invited_email IS NOT NULL
    AND lower(invited_email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_link_org_members ON auth.users;
CREATE TRIGGER on_auth_user_created_link_org_members
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_org_members_on_signup();

-- ============================================================
-- Migrate existing projects into organizations
-- ============================================================

INSERT INTO snag_organizations (name, slug)
SELECT p.name, p.slug
FROM snag_projects p
WHERE p.organization_id IS NULL
ON CONFLICT (slug) DO NOTHING;

UPDATE snag_projects p
SET organization_id = o.id
FROM snag_organizations o
WHERE p.organization_id IS NULL
  AND o.slug = p.slug;

-- ============================================================
-- RLS: organizations
-- ============================================================

ALTER TABLE snag_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE snag_org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE snag_platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE snag_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on snag_organizations" ON snag_organizations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on snag_org_members" ON snag_org_members
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on snag_platform_admins" ON snag_platform_admins
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on snag_audit_log" ON snag_audit_log
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Org members can read their organizations" ON snag_organizations
  FOR SELECT USING (id IN (SELECT public.user_org_ids()));

CREATE POLICY "Org members can read org memberships" ON snag_org_members
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

-- ============================================================
-- RLS: snag_projects — company read access (safe columns via app)
-- ============================================================

CREATE POLICY "Org members can read their projects" ON snag_projects
  FOR SELECT USING (
    organization_id IN (SELECT public.user_org_ids())
  );

-- ============================================================
-- RLS: snag_requests — company read access
-- ============================================================

CREATE POLICY "Org members can read their requests" ON snag_requests
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM snag_projects
      WHERE organization_id IN (SELECT public.user_org_ids())
    )
  );

COMMENT ON TABLE snag_organizations IS 'Snag company accounts. One org may have one or more projects.';
COMMENT ON TABLE snag_org_members IS 'Maps auth users to organizations with owner/admin/viewer roles.';
COMMENT ON TABLE snag_platform_admins IS 'Snag platform operators with full tenant management access.';
COMMENT ON TABLE snag_audit_log IS 'Audit trail for sensitive admin actions. Never store prompts or secrets.';

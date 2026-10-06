-- ============================================================
-- Org member management: look up existing accounts by email when
-- inviting, and list members with their emails. Both read auth.users,
-- so they are callable by the service role only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.snag_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.snag_org_members_with_email(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.user_id, COALESCE(u.email, m.invited_email)::text, m.role, m.created_at
  FROM snag_org_members m
  LEFT JOIN auth.users u ON u.id = m.user_id
  WHERE m.organization_id = p_org_id
  ORDER BY m.created_at;
$$;

REVOKE ALL ON FUNCTION public.snag_auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snag_org_members_with_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snag_auth_user_id_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.snag_org_members_with_email(uuid) TO service_role;

COMMENT ON FUNCTION public.snag_auth_user_id_by_email(text) IS
  'Service role only. Resolves an existing auth user so invites link immediately instead of waiting for sign-up.';
COMMENT ON FUNCTION public.snag_org_members_with_email(uuid) IS
  'Service role only. Org memberships with the signed-in or invited email.';

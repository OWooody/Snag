import type { OrgMemberManageLevel } from "@snag/shared";
import { NextResponse } from "next/server";
import { getEffectiveImpersonationOrgId } from "@/lib/impersonation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/service";

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user, error: null };
}

export async function isPlatformAdminUser(userId: string) {
  const service = createServiceClient();
  const { data } = await service
    .from("snag_platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Org admins/owners. A platform admin who is impersonating may manage only
 * the impersonated organization's projects.
 */
export async function canManageProject(userId: string, projectSlug: string) {
  const impersonatingOrgId = await getEffectiveImpersonationOrgId(userId);

  const service = createServiceClient();
  const { data: project } = await service
    .from("snag_projects")
    .select("id, organization_id")
    .eq("slug", projectSlug)
    .single();

  if (!project?.organization_id) return false;
  if (impersonatingOrgId) return project.organization_id === impersonatingOrgId;

  const { data: member } = await service
    .from("snag_org_members")
    .select("role")
    .eq("organization_id", project.organization_id)
    .eq("user_id", userId)
    .maybeSingle();

  return member?.role === "owner" || member?.role === "admin";
}

/** canManageProject, plus platform admins who are not impersonating (any project). */
export async function canAdministerProject(userId: string, projectSlug: string) {
  if (await canManageProject(userId, projectSlug)) return true;
  if (await getEffectiveImpersonationOrgId(userId)) return false;
  return isPlatformAdminUser(userId);
}

export async function canReadProject(userId: string, projectSlug: string) {
  const impersonatingOrgId = await getEffectiveImpersonationOrgId(userId);
  if (impersonatingOrgId) {
    const service = createServiceClient();
    const { data: project } = await service
      .from("snag_projects")
      .select("organization_id")
      .eq("slug", projectSlug)
      .single();
    return project?.organization_id === impersonatingOrgId;
  }

  if (await canManageProject(userId, projectSlug)) {
    return true;
  }

  const service = createServiceClient();
  const { data: project } = await service
    .from("snag_projects")
    .select("organization_id")
    .eq("slug", projectSlug)
    .single();

  if (!project?.organization_id) return false;

  const { data: member } = await service
    .from("snag_org_members")
    .select("role")
    .eq("organization_id", project.organization_id)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(member);
}

export async function canManageOrganization(userId: string, organizationId: string) {
  const impersonatingOrgId = await getEffectiveImpersonationOrgId(userId);
  if (impersonatingOrgId) return organizationId === impersonatingOrgId;

  const service = createServiceClient();
  const { data: member } = await service
    .from("snag_org_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  return member?.role === "owner" || member?.role === "admin";
}

/**
 * How much the user may change this org's memberships. Platform admins act as
 * owners (while impersonating, only for the impersonated org).
 */
export async function orgMemberManageLevel(
  userId: string,
  organizationId: string,
): Promise<OrgMemberManageLevel | null> {
  const impersonatingOrgId = await getEffectiveImpersonationOrgId(userId);
  if (impersonatingOrgId) return organizationId === impersonatingOrgId ? "owner" : null;
  if (await isPlatformAdminUser(userId)) return "owner";

  const service = createServiceClient();
  const { data: member } = await service
    .from("snag_org_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (member?.role === "owner") return "owner";
  if (member?.role === "admin") return "admin";
  return null;
}

export async function getProjectBySlug(slug: string) {
  const service = createServiceClient();
  const { data } = await service
    .from("snag_projects")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

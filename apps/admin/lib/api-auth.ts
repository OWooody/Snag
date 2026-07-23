import { NextResponse } from "next/server";
import {
  getEffectiveImpersonationOrgId,
  projectBelongsToOrg,
} from "@/lib/impersonation";
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

export async function canManageProject(userId: string, projectSlug: string) {
  const impersonatingOrgId = await getEffectiveImpersonationOrgId(userId);
  if (impersonatingOrgId && (await projectBelongsToOrg(projectSlug, impersonatingOrgId))) {
    return true;
  }

  const service = createServiceClient();
  const { data: project } = await service
    .from("snag_projects")
    .select("id, organization_id")
    .eq("slug", projectSlug)
    .single();

  if (!project?.organization_id) return false;

  const { data: member } = await service
    .from("snag_org_members")
    .select("role")
    .eq("organization_id", project.organization_id)
    .eq("user_id", userId)
    .maybeSingle();

  return member?.role === "owner" || member?.role === "admin";
}

export async function canReadProject(userId: string, projectSlug: string) {
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

export async function getProjectBySlug(slug: string) {
  const service = createServiceClient();
  const { data } = await service
    .from("snag_projects")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

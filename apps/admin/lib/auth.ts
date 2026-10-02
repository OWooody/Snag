import { SAFE_PROJECT_COLUMNS, type SnagOrganization, type SnagProjectSafe } from "@snag/shared";
import { redirect } from "next/navigation";
import { getEffectiveImpersonationOrgId, getImpersonatedProjectSlug } from "@/lib/impersonation";
import { createServiceClient } from "@/lib/service";
import { createClient } from "@/lib/supabase/server";

export interface UserContext {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  organizations: SnagOrganization[];
  projects: SnagProjectSafe[];
  impersonatingOrgId: string | null;
  /** Project chosen when impersonation started; falls back to the newest project. */
  activeProjectSlug: string | null;
  /** organization_id → role for the current user */
  orgRoles: Record<string, string>;
}

export async function getUserContext(): Promise<UserContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
  const platformAdmin = Boolean(isPlatformAdmin);
  const impersonatingOrgId = await getEffectiveImpersonationOrgId(user.id);

  const { data: orgMembers } = await supabase
    .from("snag_org_members")
    .select("organization_id, role, snag_organizations(*)")
    .eq("user_id", user.id);

  const orgRoles: Record<string, string> = {};
  for (const m of orgMembers ?? []) {
    if (m.organization_id && m.role) {
      orgRoles[m.organization_id] = m.role as string;
    }
  }

  let organizations =
    orgMembers
      ?.map((m) => m.snag_organizations as unknown as SnagOrganization)
      .filter(Boolean) ?? [];

  let projects: SnagProjectSafe[] = [];
  let activeProjectSlug: string | null = null;

  if (impersonatingOrgId) {
    activeProjectSlug = await getImpersonatedProjectSlug();
    const service = createServiceClient();
    const [{ data: impersonatedOrg }, { data: impersonatedProjects }] = await Promise.all([
      service.from("snag_organizations").select("*").eq("id", impersonatingOrgId).single(),
      service
        .from("snag_projects")
        .select(SAFE_PROJECT_COLUMNS)
        .eq("organization_id", impersonatingOrgId)
        .order("created_at", { ascending: false }),
    ]);
    if (impersonatedOrg) {
      organizations = [impersonatedOrg as SnagOrganization];
    }
    projects = (impersonatedProjects ?? []) as SnagProjectSafe[];
  } else {
    const orgIds = organizations.map((o) => o.id);
    if (orgIds.length > 0) {
      const { data } = await supabase
        .from("snag_projects")
        .select(SAFE_PROJECT_COLUMNS)
        .in("organization_id", orgIds)
        .order("created_at", { ascending: false });
      projects = (data ?? []) as SnagProjectSafe[];
    }
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    isPlatformAdmin: platformAdmin,
    organizations,
    projects,
    impersonatingOrgId,
    activeProjectSlug,
    orgRoles,
  };
}

export async function requirePlatformAdmin(): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx.isPlatformAdmin) {
    redirect("/dashboard");
  }
  return ctx;
}

export function getActiveProject(
  ctx: Pick<UserContext, "projects" | "activeProjectSlug">,
): SnagProjectSafe | null {
  const { projects, activeProjectSlug } = ctx;
  if (projects.length === 0) return null;
  if (activeProjectSlug) {
    return projects.find((p) => p.slug === activeProjectSlug) ?? projects[0];
  }
  return projects[0];
}

/** True when user may edit a project: org admin/owner, or a platform admin (impersonating: that org only). */
export function canEditProject(
  ctx: UserContext,
  project: SnagProjectSafe,
): boolean {
  if (ctx.impersonatingOrgId) {
    return project.organization_id === ctx.impersonatingOrgId;
  }
  if (ctx.isPlatformAdmin) return true;
  const role = project.organization_id ? ctx.orgRoles[project.organization_id] : null;
  return role === "owner" || role === "admin";
}

export function isImpersonating(ctx: UserContext): boolean {
  return Boolean(ctx.impersonatingOrgId);
}

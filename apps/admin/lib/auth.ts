import { SAFE_PROJECT_COLUMNS, type SnagOrganization, type SnagProjectSafe } from "@snag/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface UserContext {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  organizations: SnagOrganization[];
  projects: SnagProjectSafe[];
  impersonatingOrgId: string | null;
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

  const cookieStore = await cookies();
  const impersonatingOrgId = cookieStore.get("snag_impersonate_org")?.value ?? null;

  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

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

  const organizations =
    orgMembers
      ?.map((m) => m.snag_organizations as unknown as SnagOrganization)
      .filter(Boolean) ?? [];

  const orgIds = impersonatingOrgId
    ? [impersonatingOrgId]
    : organizations.map((o) => o.id);

  let projects: SnagProjectSafe[] = [];
  if (orgIds.length > 0) {
    const { data } = await supabase
      .from("snag_projects")
      .select(SAFE_PROJECT_COLUMNS)
      .in("organization_id", orgIds)
      .order("created_at", { ascending: false });
    projects = (data ?? []) as SnagProjectSafe[];
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    isPlatformAdmin: Boolean(isPlatformAdmin),
    organizations,
    projects,
    impersonatingOrgId,
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
  projects: SnagProjectSafe[],
  slug?: string,
): SnagProjectSafe | null {
  if (projects.length === 0) return null;
  if (slug) {
    return projects.find((p) => p.slug === slug) ?? projects[0];
  }
  return projects[0];
}

import { cookies } from "next/headers";
import { isPlatformAdminUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/service";

export const IMPERSONATE_COOKIE = "snag_impersonate_org";

/** Returns org id only if cookie is set and user is a verified platform admin. */
export async function getEffectiveImpersonationOrgId(userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get(IMPERSONATE_COOKIE)?.value ?? null;
  if (!orgId) return null;
  if (!(await isPlatformAdminUser(userId))) return null;
  return orgId;
}

export async function projectBelongsToOrg(projectSlug: string, orgId: string): Promise<boolean> {
  const service = createServiceClient();
  const { data } = await service
    .from("snag_projects")
    .select("organization_id")
    .eq("slug", projectSlug)
    .single();
  return data?.organization_id === orgId;
}

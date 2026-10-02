import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { isPlatformAdminUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/service";

export const IMPERSONATE_COOKIE = "snag_impersonate_org";
export const IMPERSONATE_PROJECT_COOKIE = "snag_impersonate_project";

const IMPERSONATION_MAX_AGE = 60 * 60;

/** Company pages that are valid for any project, so switching tenants can keep the user there. */
const TENANT_AGNOSTIC_PATHS = ["/dashboard", "/requests", "/rules", "/integration", "/settings"];

/** Returns org id only if cookie is set and user is a verified platform admin. */
export async function getEffectiveImpersonationOrgId(userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get(IMPERSONATE_COOKIE)?.value ?? null;
  if (!orgId) return null;
  if (!(await isPlatformAdminUser(userId))) return null;
  return orgId;
}

export async function getImpersonatedProjectSlug(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(IMPERSONATE_PROJECT_COOKIE)?.value ?? null;
}

export function setImpersonationCookies(
  response: NextResponse,
  value: { organizationId: string; projectSlug: string } | null,
) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: value ? IMPERSONATION_MAX_AGE : 0,
    path: "/",
  };
  response.cookies.set(IMPERSONATE_COOKIE, value?.organizationId ?? "", options);
  response.cookies.set(IMPERSONATE_PROJECT_COOKIE, value?.projectSlug ?? "", options);
}

export function safeImpersonationRedirectPath(next: unknown): string {
  if (typeof next === "string" && TENANT_AGNOSTIC_PATHS.includes(next)) return next;
  return "/dashboard";
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

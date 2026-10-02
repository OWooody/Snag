import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { safeImpersonationRedirectPath, setImpersonationCookies } from "@/lib/impersonation";
import { createServiceClient } from "@/lib/service";

/** POST only: a GET handler would run on Next.js link prefetches. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ctx = await requirePlatformAdmin();
  const { slug } = await params;

  const service = createServiceClient();
  const { data: project } = await service
    .from("snag_projects")
    .select("id, organization_id")
    .eq("slug", slug)
    .single();

  const base = new URL(request.url).origin;

  if (!project?.organization_id) {
    return NextResponse.redirect(`${base}/platform/tenants`, 303);
  }

  const form = await request.formData().catch(() => null);
  const next = safeImpersonationRedirectPath(form?.get("next"));

  if (ctx.impersonatingOrgId && ctx.impersonatingOrgId !== project.organization_id) {
    await writeAuditLog({
      actorId: ctx.userId,
      action: "impersonation.stop",
      targetType: "snag_organizations",
      targetId: ctx.impersonatingOrgId,
      metadata: {},
    });
  }

  if (ctx.impersonatingOrgId !== project.organization_id) {
    await writeAuditLog({
      actorId: ctx.userId,
      action: "impersonation.start",
      targetType: "snag_organizations",
      targetId: project.organization_id,
      metadata: { project_slug: slug, project_id: project.id },
    });
  }

  const response = NextResponse.redirect(`${base}${next}`, 303);
  setImpersonationCookies(response, {
    organizationId: project.organization_id,
    projectSlug: slug,
  });
  return response;
}

import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { IMPERSONATE_COOKIE } from "@/lib/impersonation";
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

  await writeAuditLog({
    actorId: ctx.userId,
    action: "impersonation.start",
    targetType: "snag_organizations",
    targetId: project.organization_id,
    metadata: { project_slug: slug, project_id: project.id },
  });

  const response = NextResponse.redirect(`${base}/dashboard`, 303);
  response.cookies.set(IMPERSONATE_COOKIE, project.organization_id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  return response;
}

import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  await requirePlatformAdmin();
  const { slug } = await params;

  const service = createServiceClient();
  const { data: project } = await service
    .from("snag_projects")
    .select("organization_id")
    .eq("slug", slug)
    .single();

  const base = new URL(request.url).origin;

  if (!project?.organization_id) {
    return NextResponse.redirect(`${base}/platform/tenants`);
  }

  const response = NextResponse.redirect(`${base}/dashboard`);
  response.cookies.set("snag_impersonate_org", project.organization_id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  return response;
}

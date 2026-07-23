import { SAFE_PROJECT_COLUMNS, generatePublishableKey } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { getProjectBySlug, isPlatformAdminUser, requireSessionUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { user, error } = await requireSessionUser();
  if (error) return error;

  if (!(await isPlatformAdminUser(user!.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await getProjectBySlug(slug);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const newKey = generatePublishableKey();
  const service = createServiceClient();
  const { data, error: updateError } = await service
    .from("snag_projects")
    .update({
      publishable_key: newKey,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug)
    .select(SAFE_PROJECT_COLUMNS)
    .single();

  if (updateError || !data) {
    return NextResponse.json({ error: "Rotation failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user!.id,
    action: "tenant.rotate_publishable_key",
    targetType: "snag_projects",
    targetId: project.id,
    metadata: { slug },
  });

  return NextResponse.json(data);
}

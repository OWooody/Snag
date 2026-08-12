import { SAFE_PROJECT_COLUMNS, companyProjectUpdateSchema } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canManageProject, requireSessionUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { user, error } = await requireSessionUser();
  if (error) return error;

  const allowed = await canManageProject(user!.id, slug);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = companyProjectUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error: updateError } = await service
    .from("snag_projects")
    .update({
      ...parsed.data,
      model: parsed.data.model ?? null,
      agent_mode: parsed.data.agent_mode ?? null,
      requester_followups_enabled: parsed.data.requester_followups_enabled ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug)
    .select(SAFE_PROJECT_COLUMNS)
    .single();

  if (updateError || !data) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user!.id,
    action: "project.update",
    targetType: "snag_projects",
    targetId: data.id,
    metadata: { slug, fields: Object.keys(parsed.data) },
  });

  return NextResponse.json(data);
}

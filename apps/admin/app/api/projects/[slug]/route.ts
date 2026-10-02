import { SAFE_PROJECT_COLUMNS, companyProjectUpdateSchema } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canAdministerProject, requireSessionUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { user, error } = await requireSessionUser();
  if (error) return error;

  const allowed = await canAdministerProject(user!.id, slug);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = companyProjectUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { agent_mode, ...projectFields } = parsed.data;
  const updates: Record<string, unknown> = {
    ...projectFields,
    model: parsed.data.model ?? null,
    requester_followups_enabled: parsed.data.requester_followups_enabled ?? null,
    updated_at: new Date().toISOString(),
  };
  // Omitted agent_mode is owned by the request-handling card. Null inherits.
  if (agent_mode !== undefined) {
    updates.agent_mode = agent_mode;
  }
  const { data, error: updateError } = await service
    .from("snag_projects")
    .update(updates)
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

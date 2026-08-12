import { companyOrganizationUpdateSchema } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canManageOrganization, requireSessionUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/service";

export async function PATCH(request: Request) {
  const { user, error } = await requireSessionUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = companyOrganizationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const allowed = await canManageOrganization(user!.id, parsed.data.organization_id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data, error: updateError } = await service
    .from("snag_organizations")
    .update({
      agent_mode: parsed.data.agent_mode,
      requester_followups_enabled: parsed.data.requester_followups_enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.organization_id)
    .select(
      "id, name, slug, agent_mode, requester_followups_enabled, created_at, updated_at",
    )
    .single();

  if (updateError || !data) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user!.id,
    action: "organization.update",
    targetType: "snag_organizations",
    targetId: data.id,
    metadata: { fields: ["agent_mode", "requester_followups_enabled"] },
  });

  return NextResponse.json(data);
}

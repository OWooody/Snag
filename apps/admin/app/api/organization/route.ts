import { ORGANIZATION_COLUMNS, companyOrganizationUpdateSchema } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canManageOrganization, isPlatformAdminUser, requireSessionUser } from "@/lib/api-auth";
import { getEffectiveImpersonationOrgId } from "@/lib/impersonation";
import { createServiceClient } from "@/lib/service";

export async function PATCH(request: Request) {
  const { user, error } = await requireSessionUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = companyOrganizationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const allowed =
    (await canManageOrganization(user!.id, input.organization_id)) ||
    (!(await getEffectiveImpersonationOrgId(user!.id)) && (await isPlatformAdminUser(user!.id)));
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: current } = await service
    .from("snag_organizations")
    .select("execute_delivery")
    .eq("id", input.organization_id)
    .maybeSingle();
  if (!current) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const switchingToAutoMerge =
    input.execute_delivery === "auto_merge" && current.execute_delivery !== "auto_merge";
  if (switchingToAutoMerge && input.acknowledge_auto_merge !== true) {
    return NextResponse.json(
      {
        error:
          "Acknowledge that auto-merge ships changes to production without code review.",
        missing: ["acknowledge_auto_merge"],
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    agent_mode: input.agent_mode,
    requester_followups_enabled: input.requester_followups_enabled,
    updated_at: now,
  };
  if (input.requester_plan_review_enabled !== undefined) {
    updates.requester_plan_review_enabled = input.requester_plan_review_enabled;
  }
  if (input.execute_delivery !== undefined) updates.execute_delivery = input.execute_delivery;
  if (input.default_outcome !== undefined) updates.default_outcome = input.default_outcome;
  if (input.policy_shadow_mode !== undefined) {
    updates.policy_shadow_mode = input.policy_shadow_mode;
  }

  const { data, error: updateError } = await service
    .from("snag_organizations")
    .update(updates)
    .eq("id", input.organization_id)
    .select(ORGANIZATION_COLUMNS)
    .single();

  if (updateError || !data) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  if (switchingToAutoMerge) {
    // Inheriting projects pick up auto_merge; the org-level acknowledgement covers them.
    await service
      .from("snag_projects")
      .update({ auto_merge_acknowledged_at: now })
      .eq("organization_id", input.organization_id)
      .is("execute_delivery", null)
      .is("auto_merge_acknowledged_at", null);
  }

  await writeAuditLog({
    actorId: user!.id,
    action: "organization.update",
    targetType: "snag_organizations",
    targetId: data.id,
    metadata: {
      fields: Object.keys(updates).filter((key) => key !== "updated_at"),
      execute_delivery: input.execute_delivery,
      default_outcome: input.default_outcome,
      policy_shadow_mode: input.policy_shadow_mode,
      acknowledged_auto_merge: switchingToAutoMerge,
    },
  });

  return NextResponse.json(data);
}

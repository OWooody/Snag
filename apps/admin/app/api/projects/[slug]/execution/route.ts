import {
  SAFE_PROJECT_COLUMNS,
  projectExecutionUpdateSchema,
  resolveEffectiveExecuteDelivery,
  type ExecuteDelivery,
} from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { missingDeliveryPrerequisites } from "@/lib/execution";
import { requireProjectAccess } from "@/lib/project-route";
import { createServiceClient } from "@/lib/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug, "admin");
  if (access.response) return access.response;
  const { user, project } = access;

  const body = await request.json().catch(() => null);
  const parsed = projectExecutionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const service = createServiceClient();
  let orgDelivery: ExecuteDelivery | null = null;
  if (project.organization_id) {
    const { data: org } = await service
      .from("snag_organizations")
      .select("execute_delivery")
      .eq("id", project.organization_id)
      .maybeSingle();
    orgDelivery = (org?.execute_delivery as ExecuteDelivery | undefined) ?? null;
  }

  const trusted = [...new Set(input.trusted_requesters.map((id) => id.trim()))];
  const effectiveDelivery = resolveEffectiveExecuteDelivery(input.execute_delivery, orgDelivery);
  const acknowledged =
    Boolean(project.auto_merge_acknowledged_at) || input.acknowledge_auto_merge === true;

  const missing = missingDeliveryPrerequisites(effectiveDelivery, {
    hasGitHubToken: Boolean(project.github_token_encrypted),
    hasRequesterSecret: Boolean(project.requester_signing_secret_encrypted),
    trustedRequesterCount: trusted.length,
    acknowledged,
  });
  if (missing.length > 0) {
    return NextResponse.json({ error: missing.join(" "), missing }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error: updateError } = await service
    .from("snag_projects")
    .update({
      execute_delivery: input.execute_delivery,
      default_outcome: input.default_outcome,
      policy_shadow_mode: input.policy_shadow_mode,
      trusted_requesters: trusted,
      auto_merge_daily_limit: input.auto_merge_daily_limit,
      ...(effectiveDelivery === "auto_merge" && !project.auto_merge_acknowledged_at
        ? { auto_merge_acknowledged_at: now }
        : {}),
      updated_at: now,
    })
    .eq("id", project.id)
    .select(SAFE_PROJECT_COLUMNS)
    .single();

  if (updateError || !data) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "project.execution_update",
    targetType: "snag_projects",
    targetId: project.id,
    metadata: {
      slug,
      execute_delivery: input.execute_delivery,
      effective_delivery: effectiveDelivery,
      default_outcome: input.default_outcome,
      policy_shadow_mode: input.policy_shadow_mode,
      trusted_requester_count: trusted.length,
      auto_merge_daily_limit: input.auto_merge_daily_limit,
      acknowledged_auto_merge:
        effectiveDelivery === "auto_merge" && !project.auto_merge_acknowledged_at,
    },
  });

  return NextResponse.json(data);
}

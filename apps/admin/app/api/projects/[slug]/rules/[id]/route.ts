import { POLICY_RULE_COLUMNS, policyRuleToggleSchema } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/project-route";
import { createServiceClient } from "@/lib/service";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

/** Rules visible from this project: its own plus organization-wide ones. */
async function loadRule(projectId: string, organizationId: string | null, ruleId: string) {
  if (!organizationId) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("snag_policy_rules")
    .select(POLICY_RULE_COLUMNS)
    .eq("id", ruleId)
    .eq("organization_id", organizationId)
    .or(`project_id.is.null,project_id.eq.${projectId}`)
    .maybeSingle();
  return data;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { slug, id } = await params;
  const access = await requireProjectAccess(slug, "admin");
  if (access.response) return access.response;
  const { user, project } = access;

  const body = await request.json().catch(() => null);
  const parsed = policyRuleToggleSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: parsed.success ? "Nothing to update" : parsed.error.flatten() },
      { status: 400 },
    );
  }

  const rule = await loadRule(project.id, project.organization_id, id);
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("snag_policy_rules")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", rule.id)
    .select(POLICY_RULE_COLUMNS)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "policy_rule.update",
    targetType: "snag_policy_rules",
    targetId: rule.id,
    metadata: { slug, name: rule.name, changes: parsed.data },
  });

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { slug, id } = await params;
  const access = await requireProjectAccess(slug, "admin");
  if (access.response) return access.response;
  const { user, project } = access;

  const rule = await loadRule(project.id, project.organization_id, id);
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const service = createServiceClient();
  const { error } = await service.from("snag_policy_rules").delete().eq("id", rule.id);
  if (error) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "policy_rule.delete",
    targetType: "snag_policy_rules",
    targetId: rule.id,
    metadata: {
      slug,
      name: rule.name,
      kind: rule.kind,
      outcome: rule.outcome,
      scope: rule.project_id ? "project" : "organization",
      condition: rule.condition,
    },
  });

  return NextResponse.json({ ok: true });
}

import { POLICY_RULE_COLUMNS, policyRuleBulkCreateSchema } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/project-route";
import { createServiceClient } from "@/lib/service";

const MAX_RULES_PER_SCOPE = 50;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug, "admin");
  if (access.response) return access.response;
  const { user, project } = access;

  if (!project.organization_id) {
    return NextResponse.json({ error: "Project has no organization" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = policyRuleBulkCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { scope, template_id: templateId, rules } = parsed.data;
  const projectId = scope === "organization" ? null : project.id;

  const service = createServiceClient();
  const countQuery = service
    .from("snag_policy_rules")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", project.organization_id);
  const { count } = await (projectId
    ? countQuery.eq("project_id", projectId)
    : countQuery.is("project_id", null));
  if ((count ?? 0) + rules.length > MAX_RULES_PER_SCOPE) {
    return NextResponse.json(
      { error: `At most ${MAX_RULES_PER_SCOPE} rules per ${scope}` },
      { status: 400 },
    );
  }

  const { data, error: insertError } = await service
    .from("snag_policy_rules")
    .insert(
      rules.map((rule) => ({
        organization_id: project.organization_id,
        project_id: projectId,
        name: rule.name,
        enabled: rule.enabled,
        shadow: rule.shadow,
        kind: rule.kind,
        condition: rule.condition,
        outcome: rule.outcome,
        created_by: user.id,
      })),
    )
    .select(POLICY_RULE_COLUMNS);
  if (insertError || !data) {
    return NextResponse.json({ error: "Failed to create rules" }, { status: 500 });
  }

  for (const row of data) {
    await writeAuditLog({
      actorId: user.id,
      action: "policy_rule.create",
      targetType: "snag_policy_rules",
      targetId: row.id,
      metadata: {
        slug,
        scope,
        template_id: templateId ?? null,
        name: row.name,
        kind: row.kind,
        outcome: row.outcome,
        enabled: row.enabled,
        shadow: row.shadow,
        condition: row.condition,
      },
    });
  }

  return NextResponse.json({ rules: data }, { status: 201 });
}

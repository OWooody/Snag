import { POLICY_RULE_COLUMNS, policyRuleCreateSchema } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/project-route";
import { createServiceClient } from "@/lib/service";

const MAX_RULES_PER_SCOPE = 50;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug, "read");
  if (access.response) return access.response;
  const { project } = access;

  if (!project.organization_id) return NextResponse.json({ rules: [] });

  const service = createServiceClient();
  const { data, error } = await service
    .from("snag_policy_rules")
    .select(POLICY_RULE_COLUMNS)
    .eq("organization_id", project.organization_id)
    .or(`project_id.is.null,project_id.eq.${project.id}`)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Failed to load rules" }, { status: 500 });
  }
  return NextResponse.json({ rules: data ?? [] });
}

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
  const parsed = policyRuleCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { scope, ...rule } = parsed.data;
  const projectId = scope === "organization" ? null : project.id;

  const service = createServiceClient();
  const countQuery = service
    .from("snag_policy_rules")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", project.organization_id);
  const { count } = await (projectId
    ? countQuery.eq("project_id", projectId)
    : countQuery.is("project_id", null));
  if ((count ?? 0) >= MAX_RULES_PER_SCOPE) {
    return NextResponse.json(
      { error: `At most ${MAX_RULES_PER_SCOPE} rules per ${scope}` },
      { status: 400 },
    );
  }

  const { data, error: insertError } = await service
    .from("snag_policy_rules")
    .insert({
      organization_id: project.organization_id,
      project_id: projectId,
      name: rule.name,
      enabled: rule.enabled,
      shadow: rule.shadow,
      kind: rule.kind,
      condition: rule.condition,
      outcome: rule.outcome,
      created_by: user.id,
    })
    .select(POLICY_RULE_COLUMNS)
    .single();
  if (insertError || !data) {
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "policy_rule.create",
    targetType: "snag_policy_rules",
    targetId: data.id,
    metadata: {
      slug,
      scope,
      name: rule.name,
      kind: rule.kind,
      outcome: rule.outcome,
      enabled: rule.enabled,
      shadow: rule.shadow,
      condition: rule.condition,
    },
  });

  return NextResponse.json(data, { status: 201 });
}

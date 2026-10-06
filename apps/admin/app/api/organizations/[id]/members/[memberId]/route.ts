import {
  assignableOrgMemberRoles,
  canChangeOrgMember,
  orgMemberUpdateSchema,
  type OrgMemberRole,
} from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { orgMemberManageLevel, requireSessionUser } from "@/lib/api-auth";
import { countOrgOwners } from "@/lib/members";
import { createServiceClient } from "@/lib/service";

type RouteParams = { params: Promise<{ id: string; memberId: string }> };

const LAST_OWNER_ERROR = "An organization needs at least one owner";

async function authorize(organizationId: string, memberId: string) {
  const { user, error } = await requireSessionUser();
  if (error) return { response: error } as const;

  const level = await orgMemberManageLevel(user!.id, organizationId);
  if (!level) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }

  const service = createServiceClient();
  const { data: member } = await service
    .from("snag_org_members")
    .select("id, role")
    .eq("id", memberId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!member) {
    return {
      response: NextResponse.json({ error: "Member not found" }, { status: 404 }),
    } as const;
  }

  const role = member.role as OrgMemberRole;
  if (!canChangeOrgMember(level, role)) {
    return {
      response: NextResponse.json({ error: "Only owners can change owners" }, { status: 403 }),
    } as const;
  }

  return { user: user!, level, member: { id: member.id as string, role } } as const;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id: organizationId, memberId } = await params;
  const auth = await authorize(organizationId, memberId);
  if ("response" in auth) return auth.response;
  const { user, level, member } = auth;

  const body = await request.json().catch(() => null);
  const parsed = orgMemberUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { role } = parsed.data;
  if (role === member.role) return NextResponse.json({ ok: true });

  if (!assignableOrgMemberRoles(level).includes(role)) {
    return NextResponse.json({ error: "Only owners can add owners" }, { status: 403 });
  }
  if (member.role === "owner" && (await countOrgOwners(organizationId)) <= 1) {
    return NextResponse.json({ error: LAST_OWNER_ERROR }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("snag_org_members")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", member.id);
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  await writeAuditLog({
    actorId: user.id,
    action: "organization.member.update",
    targetType: "snag_organizations",
    targetId: organizationId,
    metadata: { member_id: member.id, from_role: member.role, to_role: role },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id: organizationId, memberId } = await params;
  const auth = await authorize(organizationId, memberId);
  if ("response" in auth) return auth.response;
  const { user, member } = auth;

  if (member.role === "owner" && (await countOrgOwners(organizationId)) <= 1) {
    return NextResponse.json({ error: LAST_OWNER_ERROR }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from("snag_org_members").delete().eq("id", member.id);
  if (error) return NextResponse.json({ error: "Remove failed" }, { status: 500 });

  await writeAuditLog({
    actorId: user.id,
    action: "organization.member.remove",
    targetType: "snag_organizations",
    targetId: organizationId,
    metadata: { member_id: member.id, role: member.role },
  });

  return NextResponse.json({ ok: true });
}

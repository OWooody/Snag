import { assignableOrgMemberRoles, orgMemberInviteSchema } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { orgMemberManageLevel, requireSessionUser } from "@/lib/api-auth";
import { loadOrgMembers } from "@/lib/members";
import { createServiceClient } from "@/lib/service";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { id: organizationId } = await params;
  const { user, error } = await requireSessionUser();
  if (error) return error;

  const level = await orgMemberManageLevel(user!.id, organizationId);
  if (!level) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = orgMemberInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, role } = parsed.data;

  if (!assignableOrgMemberRoles(level).includes(role)) {
    return NextResponse.json({ error: "Only owners can add owners" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: org } = await service
    .from("snag_organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const existing = await loadOrgMembers(organizationId);
  if (existing.some((m) => m.email.toLowerCase() === email)) {
    return NextResponse.json({ error: "That person is already a member" }, { status: 409 });
  }

  const { data: existingUserId } = await service.rpc("snag_auth_user_id_by_email", {
    p_email: email,
  });
  const userId = (existingUserId as string | null) ?? null;

  const { data: member, error: insertError } = await service
    .from("snag_org_members")
    .insert(
      userId
        ? { organization_id: organizationId, user_id: userId, role }
        : { organization_id: organizationId, invited_email: email, role },
    )
    .select("id")
    .single();

  if (insertError || !member) {
    if (insertError?.code === "23505") {
      return NextResponse.json({ error: "That person is already a member" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }

  if (!userId) {
    try {
      await service.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3000"}/auth/callback`,
      });
    } catch {
      // Invite is best-effort; the member row links on first magic-link sign-in
    }
  }

  await writeAuditLog({
    actorId: user!.id,
    action: "organization.member.add",
    targetType: "snag_organizations",
    targetId: organizationId,
    metadata: { member_id: member.id, role, existing_account: Boolean(userId) },
  });

  return NextResponse.json({ id: member.id, active: Boolean(userId) });
}

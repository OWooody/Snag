import { encryptSecret, slackWebhookUpdateSchema } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canManageOrganization, isPlatformAdminUser, requireSessionUser } from "@/lib/api-auth";
import { getEffectiveImpersonationOrgId } from "@/lib/impersonation";
import { encryptionSecretOrError } from "@/lib/project-route";
import { createServiceClient } from "@/lib/service";

type RouteParams = { params: Promise<{ id: string }> };

async function canEditOrganization(userId: string, organizationId: string): Promise<boolean> {
  if (await canManageOrganization(userId, organizationId)) return true;
  if (await getEffectiveImpersonationOrgId(userId)) return false;
  return isPlatformAdminUser(userId);
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id: organizationId } = await params;
  const { user, error } = await requireSessionUser();
  if (error) return error;
  if (!(await canEditOrganization(user!.id, organizationId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = slackWebhookUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const encryption = encryptionSecretOrError();
  if (encryption.response) return encryption.response;

  const service = createServiceClient();
  const { data: org } = await service
    .from("snag_organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const encrypted = await encryptSecret(parsed.data.webhook_url, encryption.secret);
  const now = new Date().toISOString();
  const { error: updateError } = await service
    .from("snag_organizations")
    .update({
      slack_webhook_encrypted: encrypted,
      slack_webhook_updated_at: now,
      updated_at: now,
    })
    .eq("id", organizationId);
  if (updateError) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user!.id,
    action: "organization.slack_webhook_set",
    targetType: "snag_organizations",
    targetId: organizationId,
    metadata: {},
  });

  return NextResponse.json({ ok: true, slack_webhook_updated_at: now });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id: organizationId } = await params;
  const { user, error } = await requireSessionUser();
  if (error) return error;
  if (!(await canEditOrganization(user!.id, organizationId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  const { error: updateError } = await service
    .from("snag_organizations")
    .update({
      slack_webhook_encrypted: null,
      slack_webhook_updated_at: null,
      updated_at: now,
    })
    .eq("id", organizationId);
  if (updateError) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user!.id,
    action: "organization.slack_webhook_remove",
    targetType: "snag_organizations",
    targetId: organizationId,
    metadata: {},
  });

  return NextResponse.json({ ok: true, slack_webhook_updated_at: null });
}

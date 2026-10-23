import { decryptSecret, isSlackIncomingWebhook } from "@snag/shared";
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

function slackEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { id: organizationId } = await params;
  const { user, error } = await requireSessionUser();
  if (error) return error;
  if (!(await canEditOrganization(user!.id, organizationId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const encryption = encryptionSecretOrError();
  if (encryption.response) return encryption.response;

  const service = createServiceClient();
  const { data: org } = await service
    .from("snag_organizations")
    .select("id, name, slack_webhook_encrypted")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.slack_webhook_encrypted) {
    return NextResponse.json({ error: "Connect Slack before sending a test message." }, { status: 400 });
  }

  let webhookUrl: string;
  try {
    webhookUrl = await decryptSecret(org.slack_webhook_encrypted, encryption.secret);
  } catch {
    return NextResponse.json({ error: "Could not read the saved Slack webhook." }, { status: 500 });
  }
  if (!isSlackIncomingWebhook(webhookUrl)) {
    return NextResponse.json({ error: "The saved Slack webhook is not valid." }, { status: 400 });
  }

  const text = [
    "*Snag · test message*",
    "",
    `Slack is connected for ${slackEscape(org.name)}. Snag will post here when auto-merge needs a developer.`,
  ].join("\n");

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Slack rejected the test message. Check that the webhook is still active." },
        { status: 502 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Could not reach Slack." }, { status: 502 });
  }

  await writeAuditLog({
    actorId: user!.id,
    action: "organization.slack_test",
    targetType: "snag_organizations",
    targetId: organizationId,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}

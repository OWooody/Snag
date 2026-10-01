import { encryptSecret } from "@snag/shared";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { encryptionSecretOrError, requireProjectAccess } from "@/lib/project-route";
import { createServiceClient } from "@/lib/service";

/**
 * Generates (or rotates) the HMAC secret the host app's backend uses to sign
 * requester tokens. The plaintext is returned once and never again.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug, "admin");
  if (access.response) return access.response;
  const { user, project } = access;

  const encryption = encryptionSecretOrError();
  if (encryption.response) return encryption.response;

  const secret = `snag_rs_${randomBytes(32).toString("base64url")}`;
  const encrypted = await encryptSecret(secret, encryption.secret);
  const now = new Date().toISOString();

  const service = createServiceClient();
  const { error: updateError } = await service
    .from("snag_projects")
    .update({
      requester_signing_secret_encrypted: encrypted,
      requester_secret_updated_at: now,
      updated_at: now,
    })
    .eq("id", project.id);
  if (updateError) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: project.requester_signing_secret_encrypted
      ? "project.requester_secret_rotate"
      : "project.requester_secret_create",
    targetType: "snag_projects",
    targetId: project.id,
    metadata: { slug },
  });

  return NextResponse.json(
    { secret, requester_secret_updated_at: now },
    { headers: { "Cache-Control": "no-store" } },
  );
}

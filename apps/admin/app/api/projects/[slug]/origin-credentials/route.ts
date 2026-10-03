import { encryptSecret, originCredentialsUpdateSchema } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { verifyOriginAppAccess } from "@/lib/origin";
import { encryptionSecretOrError, requireProjectAccess } from "@/lib/project-route";
import { createServiceClient } from "@/lib/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug, "admin");
  if (access.response) return access.response;
  const { user, project } = access;

  const body = await request.json().catch(() => null);
  const parsed = originCredentialsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const encryption = encryptionSecretOrError();
  if (encryption.response) return encryption.response;

  const problem = await verifyOriginAppAccess({
    appId: parsed.data.origin_app_id,
    installationId: parsed.data.origin_installation_id,
    privateKeyPem: parsed.data.origin_app_private_key,
    repoUrl: project.repo_url,
  });
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const encrypted = await encryptSecret(parsed.data.origin_app_private_key, encryption.secret);
  const now = new Date().toISOString();
  const service = createServiceClient();
  const { error: updateError } = await service
    .from("snag_projects")
    .update({
      origin_app_id: parsed.data.origin_app_id,
      origin_installation_id: parsed.data.origin_installation_id,
      origin_app_key_encrypted: encrypted,
      origin_credentials_updated_at: now,
      updated_at: now,
    })
    .eq("id", project.id);
  if (updateError) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "project.origin_credentials_rotate",
    targetType: "snag_projects",
    targetId: project.id,
    metadata: {
      slug,
      origin_app_id: parsed.data.origin_app_id,
      origin_installation_id: parsed.data.origin_installation_id,
    },
  });

  return NextResponse.json({
    ok: true,
    origin_app_id: parsed.data.origin_app_id,
    origin_installation_id: parsed.data.origin_installation_id,
    origin_credentials_updated_at: now,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug, "admin");
  if (access.response) return access.response;
  const { user, project } = access;

  const service = createServiceClient();
  const { error: updateError } = await service
    .from("snag_projects")
    .update({
      origin_app_id: null,
      origin_installation_id: null,
      origin_app_key_encrypted: null,
      origin_credentials_updated_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id);
  if (updateError) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "project.origin_credentials_remove",
    targetType: "snag_projects",
    targetId: project.id,
    metadata: { slug },
  });

  return NextResponse.json({ ok: true });
}

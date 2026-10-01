import { assertEncryptionSecret, cursorKeyUpdateSchema, encryptSecret } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canAdministerProject, getProjectBySlug, requireSessionUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { user, error } = await requireSessionUser();
  if (error) return error;

  const allowed = await canAdministerProject(user!.id, slug);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = cursorKeyUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let encryptionSecret: string;
  try {
    encryptionSecret = assertEncryptionSecret(process.env.SNAG_KEY_ENCRYPTION_SECRET);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Encryption not configured" },
      { status: 500 },
    );
  }

  const encrypted = await encryptSecret(parsed.data.cursor_api_key, encryptionSecret);
  const project = await getProjectBySlug(slug);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const service = createServiceClient();
  const { error: updateError } = await service
    .from("snag_projects")
    .update({
      cursor_api_key_encrypted: encrypted,
      cursor_key_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug);

  if (updateError) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user!.id,
    action: "project.cursor_key_rotate",
    targetType: "snag_projects",
    targetId: project.id,
    metadata: { slug },
  });

  return NextResponse.json({ ok: true });
}

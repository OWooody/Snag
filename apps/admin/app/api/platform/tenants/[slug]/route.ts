import {
  SAFE_PROJECT_COLUMNS,
  assertEncryptionSecret,
  encryptSecret,
  platformTenantUpdateSchema,
} from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { getProjectBySlug, isPlatformAdminUser, requireSessionUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { user, error } = await requireSessionUser();
  if (error) return error;

  if (!(await isPlatformAdminUser(user!.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = platformTenantUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await getProjectBySlug(slug);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const { cursor_api_key, ...rest } = parsed.data;
  Object.assign(updates, rest);

  if (cursor_api_key) {
    const encryptionSecret = assertEncryptionSecret(process.env.SNAG_KEY_ENCRYPTION_SECRET);
    updates.cursor_api_key_encrypted = await encryptSecret(cursor_api_key, encryptionSecret);
    updates.cursor_key_updated_at = new Date().toISOString();
  }

  const service = createServiceClient();
  const { data, error: updateError } = await service
    .from("snag_projects")
    .update(updates)
    .eq("slug", slug)
    .select(SAFE_PROJECT_COLUMNS)
    .single();

  if (updateError || !data) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user!.id,
    action: "tenant.update",
    targetType: "snag_projects",
    targetId: project.id,
    metadata: { slug, fields: Object.keys(parsed.data) },
  });

  return NextResponse.json(data);
}

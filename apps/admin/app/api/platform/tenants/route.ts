import {
  SAFE_PROJECT_COLUMNS,
  assertEncryptionSecret,
  createTenantSchema,
  encryptSecret,
  generatePublishableKey,
} from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { isPlatformAdminUser, requireSessionUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/service";

export async function POST(request: Request) {
  const { user, error } = await requireSessionUser();
  if (error) return error;

  if (!(await isPlatformAdminUser(user!.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createTenantSchema.safeParse(body);
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

  const input = parsed.data;
  const service = createServiceClient();
  const existingOrganizationId = input.organization_id || undefined;

  let orgId: string;
  let orgSlug: string;
  let createdOrganization = false;

  if (existingOrganizationId) {
    const { data: existing, error: existingError } = await service
      .from("snag_organizations")
      .select("id, slug")
      .eq("id", existingOrganizationId)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    orgId = existing.id;
    orgSlug = existing.slug;
  } else {
    if (!input.org_name || !input.org_slug || !input.owner_email) {
      return NextResponse.json(
        { error: "Organization name, slug, and owner email are required" },
        { status: 400 },
      );
    }

    const { data: org, error: orgError } = await service
      .from("snag_organizations")
      .insert({
        name: input.org_name,
        slug: input.org_slug,
        agent_mode: input.agent_mode,
        requester_followups_enabled: input.requester_followups_enabled,
      })
      .select("id, slug")
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: orgError?.message ?? "Failed to create org" }, { status: 500 });
    }

    orgId = org.id;
    orgSlug = org.slug;
    createdOrganization = true;
  }

  const encrypted = await encryptSecret(input.cursor_api_key, encryptionSecret);
  const publishableKey = generatePublishableKey();

  const { data: project, error: projectError } = await service
    .from("snag_projects")
    .insert({
      name: input.project_name,
      slug: input.project_slug,
      organization_id: orgId,
      publishable_key: publishableKey,
      repo_url: input.repo_url,
      repo_ref: input.repo_ref,
      model: input.model ?? null,
      cursor_api_key_encrypted: encrypted,
      prompt_instructions: input.prompt_instructions,
      per_ip_hourly_limit: input.per_ip_hourly_limit,
      hourly_limit: input.hourly_limit,
      daily_limit: input.daily_limit,
      allowed_origins: input.allowed_origins,
      cursor_key_updated_at: new Date().toISOString(),
      enabled: true,
    })
    .select(SAFE_PROJECT_COLUMNS)
    .single();

  if (projectError || !project) {
    if (createdOrganization) {
      await service.from("snag_organizations").delete().eq("id", orgId);
    }
    return NextResponse.json(
      { error: projectError?.message ?? "Failed to create project" },
      { status: 500 },
    );
  }

  if (createdOrganization && input.owner_email) {
    await service.from("snag_org_members").insert({
      organization_id: orgId,
      invited_email: input.owner_email.toLowerCase(),
      role: "owner",
    });

    try {
      await service.auth.admin.inviteUserByEmail(input.owner_email, {
        redirectTo: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3000"}/auth/callback`,
      });
    } catch {
      // Invite is best-effort; member row links on first magic-link sign-in
    }
  }

  await writeAuditLog({
    actorId: user!.id,
    action: "tenant.create",
    targetType: "snag_projects",
    targetId: project.id,
    metadata: {
      org_slug: orgSlug,
      project_slug: input.project_slug,
      existing_organization: !createdOrganization,
    },
  });

  const relayUrl =
    process.env.NEXT_PUBLIC_SNAG_RELAY_URL ??
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/relay`;

  return NextResponse.json({
    project,
    integration: {
      endpoint: relayUrl,
      projectKey: project.publishable_key,
    },
  });
}

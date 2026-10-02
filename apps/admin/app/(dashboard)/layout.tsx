import { AppShell } from "@/components/app-shell";
import type { TenantOption } from "@/components/tenant-switcher";
import { getActiveProject, getUserContext } from "@/lib/auth";
import { createServiceClient } from "@/lib/service";

export const dynamic = "force-dynamic";

async function fetchTenantOptions(): Promise<TenantOption[]> {
  const service = createServiceClient();
  const { data } = await service
    .from("snag_projects")
    .select("slug, name, snag_organizations(name)")
    .order("name", { ascending: true });

  return (data ?? []).map((project) => {
    const raw = project.snag_organizations;
    const org = (Array.isArray(raw) ? raw[0] : raw) as { name: string } | null | undefined;
    return { slug: project.slug, name: project.name, organizationName: org?.name ?? null };
  });
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getUserContext();
  const tenants = ctx.isPlatformAdmin ? await fetchTenantOptions() : [];

  return (
    <AppShell
      email={ctx.email}
      isPlatformAdmin={ctx.isPlatformAdmin}
      impersonating={Boolean(ctx.impersonatingOrgId)}
      projectSlug={getActiveProject(ctx)?.slug}
      tenants={tenants}
    >
      {children}
    </AppShell>
  );
}

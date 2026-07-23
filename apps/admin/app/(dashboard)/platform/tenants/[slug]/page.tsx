import Link from "next/link";
import { notFound } from "next/navigation";
import { SAFE_PROJECT_COLUMNS } from "@snag/shared";
import { PlatformTenantForm } from "@/components/platform-tenant-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/service";

export default async function PlatformTenantDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePlatformAdmin();
  const { slug } = await params;
  const service = createServiceClient();

  const { data: project } = await service
    .from("snag_projects")
    .select(SAFE_PROJECT_COLUMNS)
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  let orgAgentMode: "plan_only" | "execute" = "plan_only";
  if (project.organization_id) {
    const { data: org } = await service
      .from("snag_organizations")
      .select("agent_mode")
      .eq("id", project.organization_id)
      .single();
    if (org?.agent_mode === "execute" || org?.agent_mode === "plan_only") {
      orgAgentMode = org.agent_mode;
    }
  }

  const { data: auditLog } = await service
    .from("snag_audit_log")
    .select("id, action, actor_id, metadata, created_at")
    .eq("target_id", project.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/platform/tenants" className="text-sm text-zinc-500 hover:underline">
          ← Tenants
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{project.name}</h1>
      </div>

      <PlatformTenantForm project={project} orgAgentMode={orgAgentMode} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit log</CardTitle>
        </CardHeader>
        <CardContent>
          {(auditLog ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500">No audit entries yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {auditLog!.map((entry) => (
                <li key={entry.id} className="flex justify-between gap-4 border-b border-zinc-100 py-2">
                  <span className="font-mono text-xs">{entry.action}</span>
                  <span className="text-zinc-500">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

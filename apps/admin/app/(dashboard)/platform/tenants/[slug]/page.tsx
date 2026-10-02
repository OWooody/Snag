import Link from "next/link";
import { notFound } from "next/navigation";
import { SAFE_PROJECT_COLUMNS } from "@snag/shared";
import { ActivationChecklist } from "@/components/activation-checklist";
import {
  ExecutionSettingsCard,
  type OrganizationExecutionDefaults,
} from "@/components/execution-settings-card";
import { PlatformTenantForm } from "@/components/platform-tenant-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadActivationFacts } from "@/lib/activation-facts";
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

  let orgFollowupsEnabled = true;
  const orgExecution: OrganizationExecutionDefaults = {
    agent_mode: "plan_only",
    execute_delivery: "pr_only",
    default_outcome: "review_before_execution",
    policy_shadow_mode: false,
  };
  if (project.organization_id) {
    const { data: org } = await service
      .from("snag_organizations")
      .select(
        "agent_mode, requester_followups_enabled, execute_delivery, default_outcome, policy_shadow_mode",
      )
      .eq("id", project.organization_id)
      .single();
    if (org?.agent_mode === "execute" || org?.agent_mode === "plan_only") {
      orgExecution.agent_mode = org.agent_mode;
    }
    if (typeof org?.requester_followups_enabled === "boolean") {
      orgFollowupsEnabled = org.requester_followups_enabled;
    }
    if (org) {
      orgExecution.execute_delivery = org.execute_delivery ?? orgExecution.execute_delivery;
      orgExecution.default_outcome = org.default_outcome ?? orgExecution.default_outcome;
      orgExecution.policy_shadow_mode = org.policy_shadow_mode ?? false;
    }
  }

  const [{ data: auditLog }, facts] = await Promise.all([
    service
      .from("snag_audit_log")
      .select("id, action, actor_id, metadata, created_at")
      .eq("target_id", project.id)
      .order("created_at", { ascending: false })
      .limit(20),
    loadActivationFacts(service, project),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/platform/tenants" className="text-sm text-zinc-500 hover:underline">
          ← Tenants
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{project.name}</h1>
      </div>

      <ActivationChecklist
        project={project}
        orgDelivery={orgExecution.execute_delivery}
        facts={facts}
      />

      <PlatformTenantForm project={project} orgFollowupsEnabled={orgFollowupsEnabled} />

      <ExecutionSettingsCard project={project} orgDefaults={orgExecution} />

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

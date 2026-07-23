import Link from "next/link";
import { SAFE_PROJECT_COLUMNS } from "@snag/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePlatformAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/service";

export default async function PlatformTenantsPage() {
  await requirePlatformAdmin();
  const service = createServiceClient();

  const { data: projects } = await service
    .from("snag_projects")
    .select(`${SAFE_PROJECT_COLUMNS}, snag_organizations(name, slug)`)
    .order("created_at", { ascending: false });

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const counts = new Map<string, number>();

  if (projects?.length) {
    const ids = projects.map((p) => p.id);
    const { data: requests } = await service
      .from("snag_requests")
      .select("project_id")
      .in("project_id", ids)
      .gte("created_at", weekAgo);
    for (const r of requests ?? []) {
      counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tenants</h1>
          <p className="text-sm text-zinc-500">All Snag projects across organizations</p>
        </div>
        <Button asChild>
          <Link href="/platform/tenants/new">New tenant</Link>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Organization</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Requests (7d)</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {(projects ?? []).map((project) => {
              const raw = project.snag_organizations;
              const org = (Array.isArray(raw) ? raw[0] : raw) as
                | { name: string; slug: string }
                | null
                | undefined;
              return (
                <tr key={project.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/tenants/${project.slug}`}
                      className="font-mono text-blue-600 hover:underline"
                    >
                      {project.slug}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{project.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{org?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={project.enabled ? "success" : "destructive"}>
                      {project.enabled ? "enabled" : "disabled"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{counts.get(project.id) ?? 0}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {new Date(project.created_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

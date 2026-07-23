import { StatusBadge } from "@/components/status-badge";
import { requirePlatformAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/service";
import type { SnagRequestStatus } from "@snag/shared";

export default async function PlatformRequestsPage() {
  await requirePlatformAdmin();
  const service = createServiceClient();

  const { data: requests } = await service
    .from("snag_requests")
    .select(
      "id, prompt, status, requester, branch_name, pr_url, error, created_at, snag_projects(slug, name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">All requests</h1>
        <p className="text-sm text-zinc-500">Cross-tenant change request feed</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Tenant</th>
              <th className="px-4 py-3 font-medium">Prompt</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">PR</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {(requests ?? []).map((req) => {
              const raw = req.snag_projects;
              const project = (Array.isArray(raw) ? raw[0] : raw) as
                | { slug: string; name: string }
                | null
                | undefined;
              return (
                <tr key={req.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{project?.slug ?? "—"}</td>
                  <td className="max-w-xs truncate px-4 py-3" title={req.prompt}>
                    {req.prompt}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={req.status as SnagRequestStatus} />
                  </td>
                  <td className="px-4 py-3">
                    {req.pr_url ? (
                      <a href={req.pr_url} className="text-blue-600 underline" target="_blank" rel="noreferrer">
                        PR
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {new Date(req.created_at).toLocaleString()}
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

"use client";

import { useQuery } from "@tanstack/react-query";
import type { SnagRequestRow } from "@snag/shared";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";

function RequestsTable({ projectId }: { projectId: string }) {
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["requests", projectId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("snag_requests")
        .select(
          "id, project_id, requester, prompt, status, agent_url, branch_name, pr_url, summary, error, created_at, updated_at",
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as SnagRequestRow[];
    },
    refetchInterval: (query) => {
      const rows = query.state.data ?? [];
      const inFlight = rows.some((r) => r.status === "queued" || r.status === "running");
      return inFlight ? 30_000 : false;
    },
  });

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading requests…</p>;
  }

  if (requests.length === 0) {
    return <p className="text-sm text-zinc-500">No requests yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-medium">Prompt</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Requester</th>
            <th className="px-4 py-3 font-medium">Branch</th>
            <th className="px-4 py-3 font-medium">PR</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => (
            <tr key={req.id} className="border-b border-zinc-100 last:border-0">
              <td className="max-w-xs truncate px-4 py-3" title={req.prompt}>
                {req.prompt}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={req.status} />
              </td>
              <td className="px-4 py-3 text-zinc-500">{req.requester ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-xs">{req.branch_name ?? "—"}</td>
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
          ))}
        </tbody>
      </table>
      {requests.some((r) => r.error) && (
        <div className="border-t border-zinc-200 p-4 text-xs text-zinc-500">
          Errors are shown in the status column context — expand rows in a future version.
        </div>
      )}
    </div>
  );
}

export { RequestsTable };

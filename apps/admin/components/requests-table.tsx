"use client";

import { useQuery } from "@tanstack/react-query";
import type { SnagRequestRow, SnagRequestStatus } from "@snag/shared";
import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES: SnagRequestStatus[] = [
  "queued",
  "running",
  "awaiting_requester",
  "awaiting_approval",
  "awaiting_review",
  "awaiting_confirmation",
];

type Filter = "all" | "needs_developer" | "awaiting_approval" | "awaiting_review";

const FILTERS: { id: Filter; label: string; matches: (row: SnagRequestRow) => boolean }[] = [
  { id: "all", label: "All", matches: () => true },
  {
    id: "needs_developer",
    label: "Needs a developer",
    matches: (row) => row.status === "awaiting_approval" || row.status === "awaiting_review",
  },
  {
    id: "awaiting_approval",
    label: "Plan approval",
    matches: (row) => row.status === "awaiting_approval",
  },
  {
    id: "awaiting_review",
    label: "PR review",
    matches: (row) => row.status === "awaiting_review",
  },
];

function RequestsTable({ projectSlug }: { projectSlug: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["requests", projectSlug],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectSlug}/requests`);
      if (!res.ok) throw new Error("Failed to load requests");
      return (await res.json()) as SnagRequestRow[];
    },
    refetchInterval: (query) => {
      const rows = query.state.data ?? [];
      const inFlight = rows.some((r) => ACTIVE_STATUSES.includes(r.status));
      return inFlight ? 30_000 : false;
    },
  });

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading requests…</p>;
  }

  if (requests.length === 0) {
    return <p className="text-sm text-zinc-500">No requests yet.</p>;
  }

  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const rows = requests.filter(active.matches);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = requests.filter(f.matches).length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                filter === f.id
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
              )}
            >
              {f.label}
              {f.id !== "all" ? ` (${count})` : null}
            </button>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing here right now.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Prompt</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Requester</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">PR</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((req) => (
                <tr key={req.id} className="border-b border-zinc-100 last:border-0">
                  <td className="max-w-xs truncate px-4 py-3" title={req.prompt}>
                    <Link href={`/requests/${req.id}`} className="hover:underline">
                      {req.prompt}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {req.requester ?? "—"}
                    {req.requester && req.requester_verified ? (
                      <span className="ml-1 text-xs text-emerald-700">verified</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{req.branch_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {req.agent_url ? (
                      <a
                        href={req.agent_url}
                        className="text-blue-600 underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {req.pr_url ? (
                      <a
                        href={req.pr_url}
                        className="text-blue-600 underline"
                        target="_blank"
                        rel="noreferrer"
                      >
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
        </div>
      )}
    </div>
  );
}

export { RequestsTable };

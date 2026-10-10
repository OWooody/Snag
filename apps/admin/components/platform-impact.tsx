"use client";

import type { PlatformImpactMetrics, PlatformImpactTenant } from "@snag/shared";
import { ArrowDown } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDay, formatPercent, formatSeconds } from "@/lib/metrics-format";
import { cn } from "@/lib/utils";

type SortKey =
  | "total"
  | "merged"
  | "merge_rate"
  | "errored"
  | "requesters"
  | "p50_submit_to_merge_seconds"
  | "total_agent_seconds";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "total", label: "Requests" },
  { key: "merged", label: "Merged" },
  { key: "merge_rate", label: "Merge rate" },
  { key: "errored", label: "Errors" },
  { key: "requesters", label: "Requesters" },
  { key: "p50_submit_to_merge_seconds", label: "Median to merge" },
  { key: "total_agent_seconds", label: "Agent time" },
];

function sortValue(tenant: PlatformImpactTenant, key: SortKey): number {
  if (key === "merge_rate") return tenant.total > 0 ? tenant.merged / tenant.total : -1;
  const value = tenant[key];
  return value === null ? -1 : Number(value);
}

function cellValue(tenant: PlatformImpactTenant, key: SortKey): string {
  switch (key) {
    case "merge_rate":
      return formatPercent(tenant.merged, tenant.total);
    case "p50_submit_to_merge_seconds":
      return formatSeconds(tenant.p50_submit_to_merge_seconds);
    case "total_agent_seconds":
      return Number(tenant.total_agent_seconds) > 0
        ? formatSeconds(Number(tenant.total_agent_seconds))
        : "—";
    default:
      return String(tenant[key]);
  }
}

function PlatformImpact({ metrics }: { metrics: PlatformImpactMetrics }) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const { totals } = metrics;
  const tenants = [...metrics.tenants].sort(
    (a, b) => sortValue(b, sortKey) - sortValue(a, sortKey) || a.slug.localeCompare(b.slug),
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Requests</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{totals.requests}</CardTitle>
            <p className="text-xs text-zinc-500">
              {totals.active_tenants} of {metrics.tenants.length} tenants active
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Merged</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {formatPercent(totals.merged, totals.requests)}
            </CardTitle>
            <p className="text-xs text-zinc-500">
              {totals.merged} merged · {totals.pr_opened} PRs opened
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Errors</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {formatPercent(totals.errored, totals.requests)}
            </CardTitle>
            <p className="text-xs text-zinc-500">{totals.errored} requests errored</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Agent time</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {formatSeconds(Number(totals.total_agent_seconds))}
            </CardTitle>
            <p className="text-xs text-zinc-500">{totals.requesters} requesters across tenants</p>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Requests per day (UTC) across all tenants</CardDescription>
          <CardTitle className="text-base">Volume</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.daily} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDay}
                  tick={{ fontSize: 12, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  labelFormatter={(day) => formatDay(String(day))}
                  cursor={{ fill: "#f4f4f5" }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e4e4e7" }}
                />
                <Legend iconType="circle" iconSize={8} itemSorter={null} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="requests" name="Requests" fill="#3f3f46" maxBarSize={20} />
                <Bar dataKey="merged" name="Merged" fill="#059669" maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Tenant</th>
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-4 py-3 text-right font-medium">
                  <button
                    type="button"
                    onClick={() => setSortKey(column.key)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-zinc-900",
                      sortKey === column.key && "text-zinc-900",
                    )}
                  >
                    {column.label}
                    {sortKey === column.key ? <ArrowDown className="h-3 w-3" /> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.slug} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tenant.name}</span>
                    {tenant.enabled ? null : <Badge variant="secondary">disabled</Badge>}
                  </div>
                  <p className="font-mono text-xs text-zinc-500">
                    {tenant.slug}
                    {tenant.organization_name ? ` · ${tenant.organization_name}` : ""}
                  </p>
                </td>
                {COLUMNS.map((column) => (
                  <td key={column.key} className="px-4 py-3 text-right tabular-nums text-zinc-700">
                    {cellValue(tenant, column.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { PlatformImpact };

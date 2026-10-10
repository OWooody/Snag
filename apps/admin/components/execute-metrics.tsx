"use client";

import { useQuery } from "@tanstack/react-query";
import { POLICY_OUTCOME_LABELS, type DurationStats, type ExecuteMetrics } from "@snag/shared";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSeconds } from "@/lib/metrics-format";

const RANGES = [7, 30] as const;

const OUTCOME_ROWS: { key: keyof ExecuteMetrics["outcomes"]; label: string }[] = [
  { key: "execute", label: POLICY_OUTCOME_LABELS.execute },
  { key: "review_before_merge", label: POLICY_OUTCOME_LABELS.review_before_merge },
  { key: "review_before_execution", label: POLICY_OUTCOME_LABELS.review_before_execution },
  { key: "rejected", label: "Rejected by a developer" },
  { key: "undecided", label: "Not decided yet" },
];

const WAIT_ROWS: { key: keyof ExecuteMetrics["waits"]; label: string }[] = [
  { key: "awaiting_approval", label: "Plan approval" },
  { key: "awaiting_review", label: "PR review" },
  { key: "awaiting_confirmation", label: "Preview confirmation" },
];

function DurationLine({ label, stats }: { label: string; stats: DurationStats | undefined }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-zinc-600">{label}</span>
      {stats && stats.count > 0 ? (
        <span className="tabular-nums">
          {formatSeconds(stats.p50_seconds)}
          <span className="text-zinc-400"> median · </span>
          {formatSeconds(stats.p90_seconds)}
          <span className="text-zinc-400"> p90 · {stats.count}</span>
        </span>
      ) : (
        <span className="text-zinc-400">No data yet</span>
      )}
    </div>
  );
}

function ExecuteMetricsSection({ projectSlug }: { projectSlug: string }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["execute-metrics", projectSlug, days],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectSlug}/metrics?days=${days}`);
      if (!res.ok) throw new Error("Failed to load metrics");
      return (await res.json()) as ExecuteMetrics;
    },
    refetchInterval: 30_000,
  });

  const historyIsPartial =
    data?.history_started_at !== undefined &&
    (data.history_started_at === null ||
      new Date(data.history_started_at).getTime() > Date.now() - days * 24 * 60 * 60 * 1000);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Execute mode</h2>
          <p className="text-sm text-zinc-500">
            How the agent&apos;s requests were decided and how long they waited on a developer.
          </p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((range) => (
            <Button
              key={range}
              size="sm"
              variant={range === days ? "secondary" : "ghost"}
              onClick={() => setDays(range)}
            >
              {range} days
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading metrics…</p>
      ) : isError || !data ? (
        <p className="text-sm text-red-600">Could not load metrics.</p>
      ) : data.total === 0 ? (
        <p className="text-sm text-zinc-500">No execute-mode requests in this range.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Outcomes</CardDescription>
              <CardTitle className="text-2xl">
                {data.total} request{data.total === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {OUTCOME_ROWS.filter((row) => (data.outcomes[row.key] ?? 0) > 0).map((row) => {
                const count = data.outcomes[row.key] ?? 0;
                return (
                  <div key={row.key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-600">{row.label}</span>
                      <span className="tabular-nums">
                        {count}
                        <span className="text-zinc-400">
                          {" "}
                          ({Math.round((count / data.total) * 100)}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100">
                      <div
                        className="h-1.5 rounded-full bg-zinc-700"
                        style={{ width: `${(count / data.total) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-xs text-zinc-500">
                Merged: {data.merged.by_snag} by Snag, {data.merged.by_developer} by a developer.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Time waiting on a developer</CardDescription>
              <CardTitle className="text-2xl">
                {formatSeconds(data.submit_to_merge.p50_seconds)}
                <span className="text-sm font-normal text-zinc-500"> median submit to merge</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {WAIT_ROWS.map((row) => (
                <DurationLine key={row.key} label={row.label} stats={data.waits[row.key]} />
              ))}
              {historyIsPartial ? (
                <p className="pt-1 text-xs text-zinc-500">
                  Still collecting data: wait times are recorded from{" "}
                  {data.history_started_at
                    ? new Date(data.history_started_at).toLocaleDateString()
                    : "the next status change"}
                  .
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Rules that escalated most</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.top_escalations.length === 0 ? (
                <p className="text-sm text-zinc-500">No rules escalated a request.</p>
              ) : (
                data.top_escalations.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{rule.name}</span>
                      {rule.kind === "builtin" ? <Badge variant="secondary">built-in</Badge> : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-600">
                      {rule.requests} request{rule.requests === 1 ? "" : "s"}
                    </span>
                  </div>
                ))
              )}
              <p className="pt-1 text-xs text-zinc-500">
                {data.shadow.decided > 0
                  ? `Shadow rules or shadow mode would have changed ${data.shadow.disagreements} of ${data.shadow.decided} decisions. `
                  : ""}
                <Link href="/rules" className="underline">
                  Manage rules
                </Link>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Why requests were handed off</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.handoff_reasons.length === 0 ? (
                <p className="text-sm text-zinc-500">No requests were handed off.</p>
              ) : (
                data.handoff_reasons.map((item) => (
                  <div key={item.reason} className="flex items-start justify-between gap-4 text-sm">
                    <span className="min-w-0 text-zinc-700">{item.reason}</span>
                    <span className="shrink-0 tabular-nums text-zinc-600">{item.requests}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}

export { DurationLine, ExecuteMetricsSection };

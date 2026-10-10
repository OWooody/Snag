"use client";

import { useQuery } from "@tanstack/react-query";
import type { ImpactHotspot, ImpactMetrics, ImpactOutcome } from "@snag/shared";
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
import { DurationLine } from "@/components/execute-metrics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDay, formatPercent, formatSeconds } from "@/lib/metrics-format";

const RANGES = [7, 30, 90] as const;

const OUTCOME_SERIES: { key: ImpactOutcome; label: string; color: string }[] = [
  { key: "merged", label: "Merged", color: "#059669" },
  { key: "finished", label: "Agent finished", color: "#34d399" },
  { key: "in_progress", label: "In progress", color: "#f59e0b" },
  { key: "error", label: "Error", color: "#dc2626" },
  { key: "rejected", label: "Rejected", color: "#a1a1aa" },
];

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
        {detail ? <p className="text-xs text-zinc-500">{detail}</p> : null}
      </CardHeader>
    </Card>
  );
}

function ProportionBar({ label, count, total }: { label: string; count: number; total: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-4 text-sm">
        <span className="min-w-0 truncate text-zinc-600" title={label}>
          {label}
        </span>
        <span className="shrink-0 tabular-nums">
          {count}
          <span className="text-zinc-400"> ({formatPercent(count, total)})</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-100">
        <div
          className="h-1.5 rounded-full bg-zinc-700"
          style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function HotspotCard({
  title,
  description,
  items,
  empty,
  mono,
}: {
  title: string;
  description: string;
  items: ImpactHotspot[];
  empty: string;
  mono?: boolean;
}) {
  const max = Math.max(1, ...items.map((item) => item.requests));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{description}</CardDescription>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">{empty}</p>
        ) : (
          items.map((item) => (
            <div key={item.key} className="space-y-1">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span
                  className={`min-w-0 truncate text-zinc-700 ${mono ? "font-mono text-xs" : ""}`}
                  title={item.key}
                >
                  {item.key}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-600">
                  {item.requests}
                  {item.merged > 0 ? (
                    <span className="text-emerald-600"> · {item.merged} merged</span>
                  ) : null}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-100">
                <div
                  className="h-1.5 rounded-full bg-zinc-700"
                  style={{ width: `${(item.requests / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function VolumeChart({ data }: { data: ImpactMetrics["daily"] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
          {OUTCOME_SERIES.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              stackId="outcome"
              fill={series.color}
              maxBarSize={32}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ImpactInsights({ projectSlug }: { projectSlug: string }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["impact-metrics", projectSlug, days],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectSlug}/impact?days=${days}`);
      if (!res.ok) throw new Error("Failed to load impact metrics");
      return (await res.json()) as ImpactMetrics;
    },
    refetchInterval: 60_000,
  });

  const historyIsPartial =
    data !== undefined &&
    (data.history_started_at === null ||
      new Date(data.history_started_at).getTime() > new Date(data.since).getTime());

  return (
    <section className="space-y-4">
      <div className="flex justify-end gap-1">
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

      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading insights…</p>
      ) : isError || !data ? (
        <p className="text-sm text-red-600">Could not load insights.</p>
      ) : data.total === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            No requests in the last {data.range_days} days.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Requests"
              value={String(data.total)}
              detail={`from ${data.requesters.active} requester${data.requesters.active === 1 ? "" : "s"}`}
            />
            <StatCard
              label="Merged"
              value={formatPercent(data.funnel.merged, data.total)}
              detail={`${data.funnel.merged} of ${data.total} requests`}
            />
            <StatCard
              label="Median submit to merge"
              value={formatSeconds(data.speed.submit_to_merge.p50_seconds)}
              detail={
                data.speed.submit_to_merge.count > 0
                  ? `p90 ${formatSeconds(data.speed.submit_to_merge.p90_seconds)}`
                  : "Nothing merged yet"
              }
            />
            <StatCard
              label="Agent time"
              value={formatSeconds(Number(data.effort.total_agent_seconds))}
              detail={`median ${formatSeconds(data.effort.agent_run.p50_seconds)} per request`}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Requests per day (UTC), by where they ended up</CardDescription>
              <CardTitle className="text-base">Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <VolumeChart data={data.daily} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>How far requests got</CardDescription>
                <CardTitle className="text-base">Funnel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <ProportionBar label="Submitted" count={data.funnel.submitted} total={data.total} />
                <ProportionBar
                  label="Agent finished the work"
                  count={data.funnel.agent_done}
                  total={data.total}
                />
                <ProportionBar label="PR opened" count={data.funnel.pr_opened} total={data.total} />
                <ProportionBar label="Merged" count={data.funnel.merged} total={data.total} />
                <p className="pt-1 text-xs text-zinc-500">
                  {data.outcomes.error ?? 0} errored, {data.outcomes.rejected ?? 0} rejected,{" "}
                  {data.outcomes.in_progress ?? 0} still in progress.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Speed and agent effort</CardDescription>
                <CardTitle className="text-base">Time to ship</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <DurationLine
                  label="Submit to agent done"
                  stats={data.speed.submit_to_agent_done}
                />
                <DurationLine label="Submit to merge" stats={data.speed.submit_to_merge} />
                <DurationLine label="Agent run time" stats={data.effort.agent_run} />
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-zinc-600">Needed requester follow-ups</span>
                  <span className="tabular-nums">
                    {data.effort.with_followups}
                    <span className="text-zinc-400">
                      {" "}
                      of {data.effort.tracked_requests} · {data.effort.followup_rounds} rounds
                    </span>
                  </span>
                </div>
                {historyIsPartial ? (
                  <p className="pt-1 text-xs text-zinc-500">
                    Still collecting data: timings are recorded from{" "}
                    {data.history_started_at
                      ? new Date(data.history_started_at).toLocaleDateString()
                      : "the next status change"}
                    .
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <HotspotCard
              title="Pages"
              description={`Where requests were filed · ${data.hotspots.with_page} with a page`}
              items={data.hotspots.pages}
              empty="No page information on these requests."
              mono
            />
            <HotspotCard
              title="Components"
              description={`Picked with the element picker · ${data.hotspots.with_elements} requests`}
              items={data.hotspots.components}
              empty="No requests picked a component."
            />
            <HotspotCard
              title="Source files"
              description="Files behind the picked elements"
              items={data.hotspots.files}
              empty="No source files recorded. They appear in development builds."
              mono
            />
          </div>
        </>
      )}
    </section>
  );
}

export { ImpactInsights };

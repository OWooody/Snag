import type { PlatformImpactMetrics } from "@snag/shared";
import Link from "next/link";
import { PlatformImpact } from "@/components/platform-impact";
import { Button } from "@/components/ui/button";
import { requirePlatformAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/service";

const RANGES = [7, 30, 90] as const;

export default async function PlatformInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requirePlatformAdmin();
  const requested = Number((await searchParams).days ?? 30);
  const days = (RANGES as readonly number[]).includes(requested) ? requested : 30;

  const { data, error } = await createServiceClient().rpc("snag_platform_impact_metrics", {
    p_days: days,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Insights</h1>
          <p className="text-sm text-zinc-500">Request volume and outcomes across every tenant</p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((range) => (
            <Button key={range} asChild size="sm" variant={range === days ? "secondary" : "ghost"}>
              <Link href={`/platform/insights?days=${range}`}>{range} days</Link>
            </Button>
          ))}
        </div>
      </div>

      {error || !data ? (
        <p className="text-sm text-red-600">Could not load insights.</p>
      ) : (
        <PlatformImpact metrics={data as PlatformImpactMetrics} />
      )}
    </div>
  );
}

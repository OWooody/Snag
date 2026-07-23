import type { SnagRequestRow } from "@snag/shared";
import { createServiceClient } from "@/lib/service";
import { createClient } from "@/lib/supabase/server";

const REQUEST_COLUMNS =
  "id, project_id, requester, prompt, status, agent_url, branch_name, pr_url, summary, error, created_at, updated_at";

export async function fetchProjectRequests(
  projectId: string,
  limit = 50,
  opts?: { useServiceRole?: boolean },
) {
  const client = opts?.useServiceRole ? createServiceClient() : await createClient();
  const { data } = await client
    .from("snag_requests")
    .select(REQUEST_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as SnagRequestRow[];
}

export function computeUsageStats(requests: SnagRequestRow[]) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const inRange = (ms: number, since: number) => ms >= since;

  const lastHour = requests.filter((r) => inRange(new Date(r.created_at).getTime(), hourAgo));
  const lastDay = requests.filter((r) => inRange(new Date(r.created_at).getTime(), dayAgo));
  const lastWeek = requests.filter((r) => inRange(new Date(r.created_at).getTime(), weekAgo));

  const finished = lastDay.filter((r) => r.status === "finished").length;
  const successRate = lastDay.length > 0 ? Math.round((finished / lastDay.length) * 100) : 0;

  const lastPr = requests.find((r) => r.pr_url);

  return {
    hour: lastHour.length,
    day: lastDay.length,
    week: lastWeek.length,
    successRate,
    lastPrUrl: lastPr?.pr_url ?? null,
  };
}

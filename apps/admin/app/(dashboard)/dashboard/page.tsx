import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { getActiveProject, getUserContext } from "@/lib/auth";
import { REVIEW_STATUSES, computeUsageStats, fetchProjectRequests } from "@/lib/requests";

export default async function DashboardPage() {
  const ctx = await getUserContext();
  const project = getActiveProject(ctx.projects);

  if (!project) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-zinc-500">
          No project assigned yet. Contact your Snag administrator to get access.
        </p>
      </div>
    );
  }

  const requests = await fetchProjectRequests(project.id, 10, {
    useServiceRole: Boolean(ctx.impersonatingOrgId),
  });
  const recent = await fetchProjectRequests(project.id, 200, {
    useServiceRole: Boolean(ctx.impersonatingOrgId),
  });
  const stats = computeUsageStats(recent);
  const needsDeveloper = recent.filter((r) =>
    (REVIEW_STATUSES as readonly string[]).includes(r.status),
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-zinc-500">Project overview and recent activity</p>
      </div>

      {needsDeveloper > 0 ? (
        <Link
          href="/requests"
          className="block rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          {needsDeveloper} request{needsDeveloper === 1 ? "" : "s"} waiting for a developer —
          review plans and PRs on the Requests page.
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Requests today</CardDescription>
            <CardTitle className="text-3xl">{stats.day}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>This week</CardDescription>
            <CardTitle className="text-3xl">{stats.week}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Success rate (24h)</CardDescription>
            <CardTitle className="text-3xl">{stats.successRate}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-lg">
              {project.enabled ? (
                <span className="text-emerald-600">Enabled</span>
              ) : (
                <span className="text-red-600">Disabled</span>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
          <CardDescription>
            <Link href="/requests" className="underline">
              View all
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-zinc-500">No requests yet.</p>
          ) : (
            <div className="space-y-3">
              {requests.slice(0, 5).map((req) => (
                <div
                  key={req.id}
                  className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{req.prompt}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(req.created_at).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={req.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

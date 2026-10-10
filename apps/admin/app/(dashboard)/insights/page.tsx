import { ImpactInsights } from "@/components/impact-insights";
import { getActiveProject, getUserContext } from "@/lib/auth";

export default async function InsightsPage() {
  const ctx = await getUserContext();
  const project = getActiveProject(ctx);

  if (!project) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="mt-2 text-zinc-500">
          {ctx.isPlatformAdmin
            ? "Pick a tenant from the switcher in the sidebar to view its insights."
            : "No project assigned."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-sm text-zinc-500">
          What people ask to change in {project.name}, how much of it ships, and how fast.
        </p>
      </div>
      <ImpactInsights projectSlug={project.slug} />
    </div>
  );
}

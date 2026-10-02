import { RequestsTable } from "@/components/requests-table";
import { getActiveProject, getUserContext } from "@/lib/auth";

export default async function RequestsPage() {
  const ctx = await getUserContext();
  const project = getActiveProject(ctx);

  if (!project) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Requests</h1>
        <p className="mt-2 text-zinc-500">No project assigned.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Requests</h1>
        <p className="text-sm text-zinc-500">
          Change requests filed from {project.name}. Auto-refreshes while agents are running.
        </p>
      </div>
      <RequestsTable projectSlug={project.slug} />
    </div>
  );
}

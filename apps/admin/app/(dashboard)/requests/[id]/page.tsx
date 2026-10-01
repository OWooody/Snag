import { RequestDetail } from "@/components/request-detail";
import { canEditProject, getActiveProject, getUserContext } from "@/lib/auth";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getUserContext();
  const project = getActiveProject(ctx.projects);

  if (!project) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Request</h1>
        <p className="mt-2 text-zinc-500">No project assigned.</p>
      </div>
    );
  }

  return (
    <RequestDetail
      projectSlug={project.slug}
      requestId={id}
      canDecide={canEditProject(ctx, project)}
    />
  );
}

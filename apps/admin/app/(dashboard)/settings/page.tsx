import { SettingsForm } from "@/components/settings-form";
import { canEditProject, getActiveProject, getUserContext } from "@/lib/auth";

export default async function SettingsPage() {
  const ctx = await getUserContext();
  const project = getActiveProject(ctx.projects);

  if (!project) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-zinc-500">No project assigned.</p>
      </div>
    );
  }

  const canEdit = canEditProject(ctx, project);
  const organization = project.organization_id
    ? (ctx.organizations.find((org) => org.id === project.organization_id) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-zinc-500">Manage your Snag project configuration.</p>
      </div>
      {canEdit ? (
        <SettingsForm project={project} organization={organization} />
      ) : (
        <p className="text-sm text-zinc-500">You have viewer access. Contact an admin to make changes.</p>
      )}
    </div>
  );
}

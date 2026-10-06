import type { OrgMemberManageLevel } from "@snag/shared";
import { MembersCard } from "@/components/members-card";
import { SettingsForm } from "@/components/settings-form";
import { canEditProject, getActiveProject, getUserContext, type UserContext } from "@/lib/auth";
import { loadOrgMembers } from "@/lib/members";

function memberManageLevel(ctx: UserContext, organizationId: string): OrgMemberManageLevel | null {
  if (ctx.impersonatingOrgId) return ctx.impersonatingOrgId === organizationId ? "owner" : null;
  if (ctx.isPlatformAdmin) return "owner";
  const role = ctx.orgRoles[organizationId];
  return role === "owner" || role === "admin" ? role : null;
}

export default async function SettingsPage() {
  const ctx = await getUserContext();
  const project = getActiveProject(ctx);

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
  const members = organization ? await loadOrgMembers(organization.id) : [];

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
      {organization && (
        <MembersCard
          organizationId={organization.id}
          members={members}
          level={memberManageLevel(ctx, organization.id)}
          currentUserId={ctx.userId}
        />
      )}
    </div>
  );
}

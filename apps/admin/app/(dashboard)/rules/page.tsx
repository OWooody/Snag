import { RuleTemplates } from "@/components/rule-templates";
import { RulesManager } from "@/components/rules-manager";
import { canEditProject, getActiveProject, getUserContext } from "@/lib/auth";

export default async function RulesPage() {
  const ctx = await getUserContext();
  const project = getActiveProject(ctx.projects);

  if (!project) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Rules</h1>
        <p className="mt-2 text-zinc-500">No project assigned.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rules</h1>
        <p className="text-sm text-zinc-500">
          Decide which execute-mode requests for {project.name} run immediately and which wait for
          a developer — before implementation or before merge.
        </p>
      </div>
      <RulesManager
        projectSlug={project.slug}
        canEdit={canEditProject(ctx, project)}
        templates={<RuleTemplates projectSlug={project.slug} />}
      />
    </div>
  );
}

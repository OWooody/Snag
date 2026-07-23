import { CopyButton } from "@/components/copy-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveProject, getUserContext } from "@/lib/auth";

export default async function IntegrationPage() {
  const ctx = await getUserContext();
  const project = getActiveProject(ctx.projects);
  const relayUrl =
    process.env.NEXT_PUBLIC_SNAG_RELAY_URL ??
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/relay`;

  if (!project) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Integration</h1>
        <p className="mt-2 text-zinc-500">No project assigned.</p>
      </div>
    );
  }

  const snippet = `import { initSnag, SnagOverlay } from "@snag-tech/react";

initSnag({
  endpoint: "${relayUrl}",
  projectKey: "${project.publishable_key}",
});

// In your root component:
<SnagOverlay />`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integration</h1>
        <p className="text-sm text-zinc-500">Add Snag to your React app with these values.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>Share these with your development team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-zinc-400">Endpoint</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-zinc-100 px-3 py-2 text-sm">{relayUrl}</code>
              <CopyButton value={relayUrl} label="Endpoint" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-zinc-400">Project key</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-zinc-100 px-3 py-2 text-sm">
                {project.publishable_key}
              </code>
              <CopyButton value={project.publishable_key} label="Project key" />
            </div>
          </div>
          {project.allowed_origins?.length ? (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase text-zinc-400">Allowed origins</p>
              <ul className="rounded bg-zinc-100 px-3 py-2 text-sm">
                {project.allowed_origins.map((origin) => (
                  <li key={origin}>
                    <code>{origin}</code>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500">
                Snag only accepts requests from these origins. Configure more in Settings.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SDK snippet</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-sm text-zinc-100">
            {snippet}
          </pre>
          <div className="mt-3">
            <CopyButton value={snippet} label="Snippet" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

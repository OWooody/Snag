import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function PlatformSystemPage() {
  await requirePlatformAdmin();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const relayUrl =
    process.env.NEXT_PUBLIC_SNAG_RELAY_URL ?? `${supabaseUrl}/functions/v1/relay`;
  const webhookUrl = `${supabaseUrl}/functions/v1/webhook`;
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1] ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System</h1>
        <p className="text-sm text-zinc-500">Snag backend endpoints and operations links</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Relay URL</CardTitle>
            <CardDescription>SDK endpoint for host apps</CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block break-all rounded bg-zinc-100 px-3 py-2 text-sm">{relayUrl}</code>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Webhook URL</CardTitle>
            <CardDescription>Cursor Cloud Agents webhooks</CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block break-all rounded bg-zinc-100 px-3 py-2 text-sm">{webhookUrl}</code>
          </CardContent>
        </Card>
      </div>

      {projectRef && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supabase dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <a
              className="block text-blue-600 underline"
              href={`https://supabase.com/dashboard/project/${projectRef}/functions`}
              target="_blank"
              rel="noreferrer"
            >
              Edge Function logs
            </a>
            <a
              className="block text-blue-600 underline"
              href={`https://supabase.com/dashboard/project/${projectRef}/editor`}
              target="_blank"
              rel="noreferrer"
            >
              SQL editor
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

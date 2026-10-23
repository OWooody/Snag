"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SlackNotificationsCard({
  organizationId,
  connectedAt,
}: {
  organizationId: string;
  connectedAt: string | null;
}) {
  const router = useRouter();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [connected, setConnected] = useState(connectedAt);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setConnected(connectedAt);
  }, [connectedAt]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!webhookUrl.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/organizations/${organizationId}/slack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_url: webhookUrl.trim() }),
    });
    setSaving(false);
    const body = (await res.json().catch(() => ({}))) as {
      error?: { fieldErrors?: { webhook_url?: string[] }; formErrors?: string[] } | string;
      slack_webhook_updated_at?: string;
    };
    if (!res.ok) {
      const flat = typeof body.error === "object" ? body.error : undefined;
      const message =
        flat?.fieldErrors?.webhook_url?.[0] ??
        flat?.formErrors?.[0] ??
        (typeof body.error === "string" ? body.error : null) ??
        "Could not save the Slack webhook";
      toast.error(message);
      return;
    }
    setWebhookUrl("");
    setConnected(body.slack_webhook_updated_at ?? new Date().toISOString());
    toast.success("Slack webhook saved");
    router.refresh();
  }

  async function disconnect() {
    setRemoving(true);
    const res = await fetch(`/api/organizations/${organizationId}/slack`, { method: "DELETE" });
    setRemoving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Could not disconnect Slack");
      return;
    }
    setConnected(null);
    toast.success("Slack disconnected");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Slack notifications</CardTitle>
        <CardDescription>
          When auto-merge is on and a request needs a developer, Snag posts to a channel in the
          Slack workspace for this organization. Paste an incoming webhook. It is stored encrypted
          and not shown again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected ? (
          <p className="text-sm text-zinc-600">
            Connected. Last updated {new Date(connected).toLocaleString()}.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Not connected. Requests will not post to Slack.</p>
        )}
        <form onSubmit={save} className="space-y-2">
          <Label htmlFor="slack_webhook_url">Incoming webhook URL</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="slack_webhook_url"
              type="password"
              autoComplete="off"
              placeholder="https://hooks.slack.com/services/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="font-mono"
            />
            <Button type="submit" variant="secondary" disabled={saving || !webhookUrl.trim()}>
              {saving ? "Saving…" : connected ? "Replace webhook" : "Save webhook"}
            </Button>
          </div>
        </form>
        {connected ? (
          <Button type="button" variant="outline" onClick={() => void disconnect()} disabled={removing}>
            {removing ? "Disconnecting…" : "Disconnect Slack"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

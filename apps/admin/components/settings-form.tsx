"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { companyProjectUpdateSchema } from "@snag/shared";
import type { SnagProjectSafe } from "@snag/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type FormValues = z.infer<typeof companyProjectUpdateSchema>;

export function SettingsForm({ project }: { project: SnagProjectSafe }) {
  const router = useRouter();
  const [cursorKey, setCursorKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(companyProjectUpdateSchema),
    defaultValues: {
      repo_url: project.repo_url,
      repo_ref: project.repo_ref,
      model: project.model,
      prompt_instructions: project.prompt_instructions,
      enabled: project.enabled,
    },
  });

  async function onSubmit(values: FormValues) {
    const res = await fetch(`/api/projects/${project.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to save settings");
      return;
    }
    toast.success("Settings saved");
    router.refresh();
  }

  async function updateCursorKey(e: React.FormEvent) {
    e.preventDefault();
    if (!cursorKey.trim()) return;
    setSavingKey(true);
    const res = await fetch(`/api/projects/${project.slug}/cursor-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cursor_api_key: cursorKey }),
    });
    setSavingKey(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to update Cursor key");
      return;
    }
    setCursorKey("");
    toast.success("Cursor API key updated");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Project settings</CardTitle>
          <CardDescription>Repository and agent configuration for {project.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="repo_url">Repository URL</Label>
              <Input id="repo_url" {...form.register("repo_url")} />
              {form.formState.errors.repo_url && (
                <p className="text-sm text-red-600">{form.formState.errors.repo_url.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="repo_ref">Branch</Label>
              <Input id="repo_ref" {...form.register("repo_ref")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model (optional)</Label>
              <Input id="model" placeholder="e.g. claude-sonnet" {...form.register("model")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt_instructions">Prompt instructions</Label>
              <Textarea
                id="prompt_instructions"
                rows={5}
                {...form.register("prompt_instructions")}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-4">
              <div>
                <p className="font-medium">Snag enabled</p>
                <p className="text-sm text-zinc-500">Disable to hide the button in your app</p>
              </div>
              <Switch
                checked={form.watch("enabled")}
                onCheckedChange={(v) => form.setValue("enabled", v)}
              />
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Save settings"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cursor API key</CardTitle>
          <CardDescription>
            Stored encrypted. Never displayed after save.
            {project.cursor_key_updated_at && (
              <> Last updated {new Date(project.cursor_key_updated_at).toLocaleString()}.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={updateCursorKey} className="flex gap-2">
            <Input
              type="password"
              placeholder="key_..."
              value={cursorKey}
              onChange={(e) => setCursorKey(e.target.value)}
              className="font-mono"
            />
            <Button type="submit" variant="secondary" disabled={savingKey || !cursorKey.trim()}>
              {savingKey ? "Saving…" : "Update key"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

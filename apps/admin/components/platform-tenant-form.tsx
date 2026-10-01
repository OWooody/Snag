"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { platformTenantUpdateSchema, parseOriginsTextarea } from "@snag/shared";
import type { AgentMode, SnagProjectSafe } from "@snag/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ProjectAgentModeOverrideSelect } from "@/components/agent-mode-select";
import { AllowedOriginsField, originsToTextarea } from "@/components/allowed-origins-field";
import { ProjectRequesterFollowupsOverrideSelect } from "@/components/requester-followups-select";

type FormValues = z.infer<typeof platformTenantUpdateSchema>;
type ProjectAgentOverride = AgentMode | "inherit";
type ProjectFollowupsOverride = boolean | "inherit";

export function PlatformTenantForm({
  project,
  orgAgentMode = "plan_only",
  orgFollowupsEnabled = true,
}: {
  project: SnagProjectSafe;
  orgAgentMode?: AgentMode;
  orgFollowupsEnabled?: boolean;
}) {
  const router = useRouter();
  const [rotating, setRotating] = useState(false);
  const [allowedOriginsText, setAllowedOriginsText] = useState(() =>
    originsToTextarea(project.allowed_origins),
  );

  const [projectAgentOverride, setProjectAgentOverride] = useState<ProjectAgentOverride>(
    project.agent_mode ?? "inherit",
  );
  const [projectFollowupsOverride, setProjectFollowupsOverride] =
    useState<ProjectFollowupsOverride>(
      typeof project.requester_followups_enabled === "boolean"
        ? project.requester_followups_enabled
        : "inherit",
    );

  useEffect(() => {
    setProjectAgentOverride(project.agent_mode ?? "inherit");
  }, [project.agent_mode]);

  useEffect(() => {
    setProjectFollowupsOverride(
      typeof project.requester_followups_enabled === "boolean"
        ? project.requester_followups_enabled
        : "inherit",
    );
  }, [project.requester_followups_enabled]);

  useEffect(() => {
    setAllowedOriginsText(originsToTextarea(project.allowed_origins));
  }, [project.allowed_origins]);

  const form = useForm<FormValues>({
    resolver: zodResolver(platformTenantUpdateSchema),
    defaultValues: {
      name: project.name,
      repo_url: project.repo_url,
      repo_ref: project.repo_ref,
      model: project.model,
      prompt_instructions: project.prompt_instructions,
      enabled: project.enabled,
      per_ip_hourly_limit: project.per_ip_hourly_limit,
      hourly_limit: project.hourly_limit,
      daily_limit: project.daily_limit,
    },
  });

  async function onSubmit(values: FormValues) {
    const { cursor_api_key, ...rest } = values;
    const payload = {
      ...rest,
      agent_mode: projectAgentOverride === "inherit" ? null : projectAgentOverride,
      requester_followups_enabled:
        projectFollowupsOverride === "inherit" ? null : projectFollowupsOverride,
      allowed_origins: parseOriginsTextarea(allowedOriginsText),
      ...(cursor_api_key?.trim() ? { cursor_api_key: cursor_api_key.trim() } : {}),
    };
    const res = await fetch(`/api/platform/tenants/${project.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    toast.success("Tenant updated");
    router.refresh();
  }

  async function rotateKey() {
    setRotating(true);
    const res = await fetch(`/api/platform/tenants/${project.slug}/rotate-key`, {
      method: "POST",
    });
    setRotating(false);
    if (!res.ok) {
      toast.error("Failed to rotate key");
      return;
    }
    toast.success("Publishable key rotated — update host apps");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* POST form, not a link: Next.js prefetches visible links with GET, which would start impersonation silently. */}
        <form method="post" action={`/platform/impersonate/${project.slug}`}>
          <Button type="submit" variant="outline">
            View as company
          </Button>
        </form>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={rotating}>
              Rotate publishable key
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rotate publishable key?</AlertDialogTitle>
              <AlertDialogDescription>
                The current key will stop working immediately. All host apps must update their
                projectKey.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={rotateKey}>Rotate key</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{project.slug}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Name</Label>
              <Input {...form.register("name")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Repository URL</Label>
              <Input {...form.register("repo_url")} />
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Input {...form.register("repo_ref")} />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input {...form.register("model")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Prompt instructions</Label>
              <Textarea rows={4} {...form.register("prompt_instructions")} />
            </div>
            <div className="sm:col-span-2">
              <AllowedOriginsField
                id="platform_allowed_origins"
                value={allowedOriginsText}
                onChange={setAllowedOriginsText}
              />
            </div>
            <div className="sm:col-span-2">
              <ProjectAgentModeOverrideSelect
                id="platform_project_agent_mode"
                value={projectAgentOverride}
                onChange={setProjectAgentOverride}
                orgDefault={orgAgentMode}
              />
            </div>
            <div className="sm:col-span-2">
              <ProjectRequesterFollowupsOverrideSelect
                id="platform_project_requester_followups"
                value={projectFollowupsOverride}
                onChange={setProjectFollowupsOverride}
                orgDefault={orgFollowupsEnabled}
              />
            </div>
            <div className="space-y-2">
              <Label>Per-IP hourly</Label>
              <Input type="number" {...form.register("per_ip_hourly_limit", { valueAsNumber: true })} />
            </div>
            <div className="space-y-2">
              <Label>Hourly</Label>
              <Input type="number" {...form.register("hourly_limit", { valueAsNumber: true })} />
            </div>
            <div className="space-y-2">
              <Label>Daily</Label>
              <Input type="number" {...form.register("daily_limit", { valueAsNumber: true })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 sm:col-span-2">
              <div>
                <p className="font-medium">Enabled</p>
                <p className="text-sm text-zinc-500">Kill switch for this tenant</p>
              </div>
              <Switch
                checked={form.watch("enabled")}
                onCheckedChange={(v) => form.setValue("enabled", v)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>New Cursor API key (optional)</Label>
              <Input type="password" className="font-mono" {...form.register("cursor_api_key")} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publishable key</CardTitle>
        </CardHeader>
        <CardContent>
          <code className="block rounded bg-zinc-100 px-3 py-2 text-sm">{project.publishable_key}</code>
        </CardContent>
      </Card>
    </div>
  );
}

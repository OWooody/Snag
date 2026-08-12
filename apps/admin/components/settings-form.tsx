"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AGENT_MODE_LABELS,
  companyProjectUpdateSchema,
  parseOriginsTextarea,
  resolveEffectiveAgentMode,
  resolveEffectiveRequesterFollowups,
  type AgentMode,
  type SnagOrganization,
  type SnagProjectSafe,
} from "@snag/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AgentModeSelect, ProjectAgentModeOverrideSelect } from "@/components/agent-mode-select";
import { AllowedOriginsField, originsToTextarea } from "@/components/allowed-origins-field";
import {
  ProjectRequesterFollowupsOverrideSelect,
  RequesterFollowupsSwitch,
} from "@/components/requester-followups-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type ProjectFormValues = z.infer<typeof companyProjectUpdateSchema>;
type ProjectAgentOverride = AgentMode | "inherit";
type ProjectFollowupsOverride = boolean | "inherit";

export function SettingsForm({
  project,
  organization,
}: {
  project: SnagProjectSafe;
  organization: SnagOrganization | null;
}) {
  const router = useRouter();
  const [cursorKey, setCursorKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [orgAgentMode, setOrgAgentMode] = useState<AgentMode>(
    organization?.agent_mode ?? "plan_only",
  );
  const [orgFollowupsEnabled, setOrgFollowupsEnabled] = useState(
    organization?.requester_followups_enabled ?? true,
  );
  const [savingOrg, setSavingOrg] = useState(false);
  const [allowedOriginsText, setAllowedOriginsText] = useState(() =>
    originsToTextarea(project.allowed_origins),
  );

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(companyProjectUpdateSchema),
    defaultValues: {
      repo_url: project.repo_url,
      repo_ref: project.repo_ref,
      model: project.model,
      prompt_instructions: project.prompt_instructions,
      enabled: project.enabled,
      agent_mode: project.agent_mode,
      requester_followups_enabled: project.requester_followups_enabled,
    },
  });

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
    if (organization) {
      setOrgAgentMode(organization.agent_mode);
      setOrgFollowupsEnabled(organization.requester_followups_enabled);
    }
  }, [organization?.agent_mode, organization?.requester_followups_enabled]);

  useEffect(() => {
    setAllowedOriginsText(originsToTextarea(project.allowed_origins));
  }, [project.allowed_origins]);

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

  const effectiveMode = resolveEffectiveAgentMode(
    projectAgentOverride === "inherit" ? null : projectAgentOverride,
    orgAgentMode,
  );
  const effectiveFollowups = resolveEffectiveRequesterFollowups(
    projectFollowupsOverride === "inherit" ? null : projectFollowupsOverride,
    orgFollowupsEnabled,
  );

  async function onSubmit(values: ProjectFormValues) {
    const res = await fetch(`/api/projects/${project.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        agent_mode: projectAgentOverride === "inherit" ? null : projectAgentOverride,
        requester_followups_enabled:
          projectFollowupsOverride === "inherit" ? null : projectFollowupsOverride,
        allowed_origins: parseOriginsTextarea(allowedOriginsText),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to save settings");
      return;
    }
    toast.success("Settings saved");
    router.refresh();
  }

  async function saveOrganizationMode() {
    if (!organization) return;
    setSavingOrg(true);
    const res = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_id: organization.id,
        agent_mode: orgAgentMode,
        requester_followups_enabled: orgFollowupsEnabled,
      }),
    });
    setSavingOrg(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to save organization settings");
      return;
    }
    toast.success("Organization settings saved");
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
      {organization ? (
        <Card>
          <CardHeader>
            <CardTitle>Organization defaults</CardTitle>
            <CardDescription>
              Applies to all projects in {organization.name} unless overridden below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AgentModeSelect
              id="org_agent_mode"
              value={orgAgentMode}
              onChange={setOrgAgentMode}
            />
            <RequesterFollowupsSwitch
              id="org_requester_followups"
              checked={orgFollowupsEnabled}
              onCheckedChange={setOrgFollowupsEnabled}
            />
            <Button type="button" onClick={saveOrganizationMode} disabled={savingOrg}>
              {savingOrg ? "Saving…" : "Save organization defaults"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Project settings</CardTitle>
          <CardDescription>
            Repository and agent configuration for {project.name}. Effective agent mode:{" "}
            <span className="font-medium text-zinc-900">{AGENT_MODE_LABELS[effectiveMode]}</span>
            . Requester follow-ups:{" "}
            <span className="font-medium text-zinc-900">
              {effectiveFollowups ? "On" : "Off"}
            </span>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ProjectAgentModeOverrideSelect
              id="project_agent_mode"
              value={projectAgentOverride}
              onChange={setProjectAgentOverride}
              orgDefault={orgAgentMode}
            />
            <ProjectRequesterFollowupsOverrideSelect
              id="project_requester_followups"
              value={projectFollowupsOverride}
              onChange={setProjectFollowupsOverride}
              orgDefault={orgFollowupsEnabled}
            />
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
            <AllowedOriginsField
              id="allowed_origins"
              value={allowedOriginsText}
              onChange={setAllowedOriginsText}
            />
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

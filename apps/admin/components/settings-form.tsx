"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  classifyExecutionPosture,
  companyProjectUpdateSchema,
  executionPostureSettings,
  parseOriginsTextarea,
  resolveEffectiveRequesterFollowups,
  type AgentMode,
  type ExecuteDelivery,
  type ExecutionPosture,
  type PolicyOutcome,
  type SnagOrganization,
  type SnagProjectSafe,
} from "@snag/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AgentModeSelect } from "@/components/agent-mode-select";
import { AllowedOriginsField, originsToTextarea } from "@/components/allowed-origins-field";
import {
  DefaultOutcomeSelect,
  ExecuteDeliverySelect,
  SHADOW_MODE_DESCRIPTION,
} from "@/components/execution-selects";
import { AdvancedDisclosure, ExecutionPosturePicker } from "@/components/execution-posture-picker";
import { ExecutionSettingsCard } from "@/components/execution-settings-card";
import {
  ProjectRequesterFollowupsOverrideSelect,
  RequesterFollowupsSwitch,
} from "@/components/requester-followups-select";
import {
  ProjectRequesterPlanReviewOverrideSelect,
  RequesterPlanReviewSwitch,
} from "@/components/requester-plan-review-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type ProjectFormValues = z.infer<typeof companyProjectUpdateSchema>;
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
  const [orgPlanReviewEnabled, setOrgPlanReviewEnabled] = useState(
    organization?.requester_plan_review_enabled ?? false,
  );
  const [orgDelivery, setOrgDelivery] = useState<ExecuteDelivery>(
    organization?.execute_delivery ?? "pr_only",
  );
  const [orgOutcome, setOrgOutcome] = useState<PolicyOutcome>(
    organization?.default_outcome ?? "review_before_execution",
  );
  const [orgShadow, setOrgShadow] = useState(organization?.policy_shadow_mode ?? false);
  const [orgAckOpen, setOrgAckOpen] = useState(false);
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
      requester_followups_enabled: project.requester_followups_enabled,
    },
  });

  const [projectFollowupsOverride, setProjectFollowupsOverride] =
    useState<ProjectFollowupsOverride>(
      typeof project.requester_followups_enabled === "boolean"
        ? project.requester_followups_enabled
        : "inherit",
    );
  const [projectPlanReviewOverride, setProjectPlanReviewOverride] =
    useState<ProjectFollowupsOverride>(
      typeof project.requester_plan_review_enabled === "boolean"
        ? project.requester_plan_review_enabled
        : "inherit",
    );

  useEffect(() => {
    if (organization) {
      setOrgAgentMode(organization.agent_mode);
      setOrgFollowupsEnabled(organization.requester_followups_enabled);
      setOrgPlanReviewEnabled(organization.requester_plan_review_enabled ?? false);
      setOrgDelivery(organization.execute_delivery ?? "pr_only");
      setOrgOutcome(organization.default_outcome ?? "review_before_execution");
      setOrgShadow(organization.policy_shadow_mode ?? false);
    }
  }, [
    organization?.agent_mode,
    organization?.requester_followups_enabled,
    organization?.requester_plan_review_enabled,
    organization?.execute_delivery,
    organization?.default_outcome,
    organization?.policy_shadow_mode,
  ]);

  useEffect(() => {
    setAllowedOriginsText(originsToTextarea(project.allowed_origins));
  }, [project.allowed_origins]);

  useEffect(() => {
    setProjectFollowupsOverride(
      typeof project.requester_followups_enabled === "boolean"
        ? project.requester_followups_enabled
        : "inherit",
    );
  }, [project.requester_followups_enabled]);

  useEffect(() => {
    setProjectPlanReviewOverride(
      typeof project.requester_plan_review_enabled === "boolean"
        ? project.requester_plan_review_enabled
        : "inherit",
    );
  }, [project.requester_plan_review_enabled]);

  const orgPosture = classifyExecutionPosture({
    agent_mode: orgAgentMode,
    execute_delivery: orgDelivery,
    default_outcome: orgOutcome,
    policy_shadow_mode: orgShadow,
  });
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
        // Agent mode is saved with request handling, not this form.
        agent_mode: undefined,
        requester_followups_enabled:
          projectFollowupsOverride === "inherit" ? null : projectFollowupsOverride,
        requester_plan_review_enabled:
          projectPlanReviewOverride === "inherit" ? null : projectPlanReviewOverride,
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

  function selectOrgPosture(posture: "inherit" | ExecutionPosture) {
    if (posture === "inherit") return;
    const settings = executionPostureSettings(posture);
    setOrgAgentMode(settings.agent_mode);
    setOrgDelivery(settings.execute_delivery);
    setOrgOutcome(settings.default_outcome);
    setOrgShadow(settings.policy_shadow_mode);
  }

  function onSaveOrganization() {
    if (orgDelivery === "auto_merge" && organization?.execute_delivery !== "auto_merge") {
      setOrgAckOpen(true);
      return;
    }
    void saveOrganizationMode(false);
  }

  async function saveOrganizationMode(acknowledgeAutoMerge: boolean) {
    if (!organization) return;
    setSavingOrg(true);
    const res = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_id: organization.id,
        agent_mode: orgAgentMode,
        requester_followups_enabled: orgFollowupsEnabled,
        requester_plan_review_enabled: orgPlanReviewEnabled,
        execute_delivery: orgDelivery,
        default_outcome: orgOutcome,
        policy_shadow_mode: orgShadow,
        acknowledge_auto_merge: acknowledgeAutoMerge || undefined,
      }),
    });
    setSavingOrg(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(
        typeof body.error === "string" ? body.error : "Failed to save organization settings",
      );
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
            <ExecutionPosturePicker
              name="org-posture"
              value={orgPosture}
              onChange={selectOrgPosture}
            />
            <AdvancedDisclosure openWhen={orgPosture === "custom"}>
              <AgentModeSelect
                id="org_agent_mode"
                value={orgAgentMode}
                onChange={setOrgAgentMode}
              />
              <ExecuteDeliverySelect
                id="org_execute_delivery"
                value={orgDelivery}
                onChange={setOrgDelivery}
              />
              <DefaultOutcomeSelect
                id="org_default_outcome"
                value={orgOutcome}
                onChange={setOrgOutcome}
              />
              <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-4">
                <div>
                  <p className="font-medium">Rules shadow mode</p>
                  <p className="text-sm text-zinc-500">{SHADOW_MODE_DESCRIPTION}</p>
                </div>
                <Switch checked={orgShadow} onCheckedChange={setOrgShadow} />
              </div>
            </AdvancedDisclosure>
            <RequesterFollowupsSwitch
              id="org_requester_followups"
              checked={orgFollowupsEnabled}
              onCheckedChange={setOrgFollowupsEnabled}
            />
            <RequesterPlanReviewSwitch
              id="org_requester_plan_review"
              checked={orgPlanReviewEnabled}
              onCheckedChange={setOrgPlanReviewEnabled}
            />
            <Button type="button" onClick={onSaveOrganization} disabled={savingOrg}>
              {savingOrg ? "Saving…" : "Save organization defaults"}
            </Button>
            <AlertDialog open={orgAckOpen} onOpenChange={setOrgAckOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Make auto-merge the organization default?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Projects that inherit this setting will merge agent PRs to production as soon
                    as CI passes when rules allow it, without code review. Each project still
                    needs a GitHub token, a requester signing secret, and trusted requesters;
                    otherwise it stays on PR only.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void saveOrganizationMode(true)}>
                    I understand, save
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Project settings</CardTitle>
          <CardDescription>
            Repository and agent configuration for {project.name}. Requester follow-ups:{" "}
            <span className="font-medium text-zinc-900">
              {effectiveFollowups ? "On" : "Off"}
            </span>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ProjectRequesterFollowupsOverrideSelect
              id="project_requester_followups"
              value={projectFollowupsOverride}
              onChange={setProjectFollowupsOverride}
              orgDefault={orgFollowupsEnabled}
            />
            <ProjectRequesterPlanReviewOverrideSelect
              id="project_requester_plan_review"
              value={projectPlanReviewOverride}
              onChange={setProjectPlanReviewOverride}
              orgDefault={orgPlanReviewEnabled}
            />
            <div className="space-y-2">
              <Label htmlFor="repo_url">Repository URL</Label>
              <Input
                id="repo_url"
                placeholder="https://github.com/org/repo or https://origin.cursor.com/org/repo"
                {...form.register("repo_url")}
              />
              <p className="text-sm text-zinc-500">
                GitHub or Cursor Origin. Preview, then merge is available on GitHub.
              </p>
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

      <ExecutionSettingsCard
        project={project}
        orgDefaults={{
          agent_mode: organization?.agent_mode ?? "plan_only",
          execute_delivery: organization?.execute_delivery ?? "pr_only",
          default_outcome: organization?.default_outcome ?? "review_before_execution",
          policy_shadow_mode: organization?.policy_shadow_mode ?? false,
        }}
      />

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

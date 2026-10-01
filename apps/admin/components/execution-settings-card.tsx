"use client";

import {
  EXECUTE_DELIVERY_LABELS,
  POLICY_OUTCOME_LABELS,
  resolveEffectiveDefaultOutcome,
  resolveEffectiveExecuteDelivery,
  resolveEffectivePolicyShadowMode,
  type ExecuteDelivery,
  type PolicyOutcome,
  type SnagProjectSafe,
} from "@snag/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import {
  ProjectDefaultOutcomeOverrideSelect,
  ProjectExecuteDeliveryOverrideSelect,
  ShadowModeOverrideSelect,
} from "@/components/execution-selects";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { missingDeliveryPrerequisites } from "@/lib/execution";

export interface OrganizationExecutionDefaults {
  execute_delivery: ExecuteDelivery;
  default_outcome: PolicyOutcome;
  policy_shadow_mode: boolean;
}

function parseRequesterList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,]/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (typeof body.error === "string") return body.error;
  return fallback;
}

export function ExecutionSettingsCard({
  project,
  orgDefaults,
}: {
  project: SnagProjectSafe;
  orgDefaults: OrganizationExecutionDefaults;
}) {
  const router = useRouter();
  const [delivery, setDelivery] = useState<ExecuteDelivery | "inherit">(
    project.execute_delivery ?? "inherit",
  );
  const [outcome, setOutcome] = useState<PolicyOutcome | "inherit">(
    project.default_outcome ?? "inherit",
  );
  const [shadow, setShadow] = useState<boolean | "inherit">(
    typeof project.policy_shadow_mode === "boolean" ? project.policy_shadow_mode : "inherit",
  );
  const [trustedText, setTrustedText] = useState(() =>
    (project.trusted_requesters ?? []).join("\n"),
  );
  const [dailyLimit, setDailyLimit] = useState(project.auto_merge_daily_limit ?? 10);
  const [saving, setSaving] = useState(false);
  const [ackOpen, setAckOpen] = useState(false);

  const [githubToken, setGithubToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [generatingSecret, setGeneratingSecret] = useState(false);

  useEffect(() => {
    setDelivery(project.execute_delivery ?? "inherit");
    setOutcome(project.default_outcome ?? "inherit");
    setShadow(
      typeof project.policy_shadow_mode === "boolean" ? project.policy_shadow_mode : "inherit",
    );
    setTrustedText((project.trusted_requesters ?? []).join("\n"));
    setDailyLimit(project.auto_merge_daily_limit ?? 10);
  }, [
    project.execute_delivery,
    project.default_outcome,
    project.policy_shadow_mode,
    project.trusted_requesters,
    project.auto_merge_daily_limit,
  ]);

  const effectiveDelivery = resolveEffectiveExecuteDelivery(
    delivery === "inherit" ? null : delivery,
    orgDefaults.execute_delivery,
  );
  const effectiveOutcome = resolveEffectiveDefaultOutcome(
    outcome === "inherit" ? null : outcome,
    orgDefaults.default_outcome,
  );
  const effectiveShadow = resolveEffectivePolicyShadowMode(
    shadow === "inherit" ? null : shadow,
    orgDefaults.policy_shadow_mode,
  );
  const trusted = parseRequesterList(trustedText);
  const needsAcknowledgement =
    effectiveDelivery === "auto_merge" && !project.auto_merge_acknowledged_at;
  const missing = missingDeliveryPrerequisites(effectiveDelivery, {
    hasGitHubToken: Boolean(project.github_token_updated_at),
    hasRequesterSecret: Boolean(project.requester_secret_updated_at),
    trustedRequesterCount: trusted.length,
    acknowledged: true,
  });

  async function save(acknowledge: boolean) {
    setSaving(true);
    const res = await fetch(`/api/projects/${project.slug}/execution`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        execute_delivery: delivery === "inherit" ? null : delivery,
        default_outcome: outcome === "inherit" ? null : outcome,
        policy_shadow_mode: shadow === "inherit" ? null : shadow,
        trusted_requesters: trusted,
        auto_merge_daily_limit: dailyLimit,
        acknowledge_auto_merge: acknowledge || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to save execution settings"));
      return;
    }
    toast.success("Execution settings saved");
    router.refresh();
  }

  function onSave() {
    if (needsAcknowledgement && missing.length === 0) {
      setAckOpen(true);
      return;
    }
    void save(false);
  }

  async function saveGithubToken(e: React.FormEvent) {
    e.preventDefault();
    if (!githubToken.trim()) return;
    setSavingToken(true);
    const res = await fetch(`/api/projects/${project.slug}/github-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ github_token: githubToken }),
    });
    setSavingToken(false);
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to save GitHub token"));
      return;
    }
    setGithubToken("");
    toast.success("GitHub token saved");
    router.refresh();
  }

  async function removeGithubToken() {
    const res = await fetch(`/api/projects/${project.slug}/github-token`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to remove GitHub token"));
      return;
    }
    toast.success("GitHub token removed");
    router.refresh();
  }

  async function generateSecret() {
    setGeneratingSecret(true);
    const res = await fetch(`/api/projects/${project.slug}/requester-secret`, { method: "POST" });
    setGeneratingSecret(false);
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to generate secret"));
      return;
    }
    const body = (await res.json()) as { secret: string };
    setRevealedSecret(body.secret);
    toast.success("Requester signing secret generated");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Execution and delivery</CardTitle>
          <CardDescription>
            Applies when the agent mode is Execute. Effective delivery:{" "}
            <span className="font-medium text-zinc-900">
              {EXECUTE_DELIVERY_LABELS[effectiveDelivery]}
            </span>
            . Without a matching allow rule:{" "}
            <span className="font-medium text-zinc-900">
              {POLICY_OUTCOME_LABELS[effectiveOutcome]}
            </span>
            . Shadow mode:{" "}
            <span className="font-medium text-zinc-900">{effectiveShadow ? "On" : "Off"}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProjectExecuteDeliveryOverrideSelect
            id="project_execute_delivery"
            value={delivery}
            onChange={setDelivery}
            orgDefault={orgDefaults.execute_delivery}
          />
          <ProjectDefaultOutcomeOverrideSelect
            id="project_default_outcome"
            value={outcome}
            onChange={setOutcome}
            orgDefault={orgDefaults.default_outcome}
          />
          <ShadowModeOverrideSelect
            id="project_shadow_mode"
            value={shadow}
            onChange={setShadow}
            orgDefault={orgDefaults.policy_shadow_mode}
          />
          <div className="space-y-2">
            <Label htmlFor="trusted_requesters">Trusted requesters</Label>
            <Textarea
              id="trusted_requesters"
              rows={4}
              placeholder={"user_123\nops@example.com"}
              value={trustedText}
              onChange={(e) => setTrustedText(e.target.value)}
              className="font-mono"
            />
            <p className="text-sm text-zinc-500">
              One requester id per line, matching the <code>sub</code> in signed requester tokens.
              Auto-merge only applies to verified requesters on this list.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="auto_merge_daily_limit">Daily auto-merge limit</Label>
            <Input
              id="auto_merge_daily_limit"
              type="number"
              min={1}
              max={500}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value) || 1)}
            />
            <p className="text-sm text-zinc-500">
              Merges approved by rules in the last 24 hours. Past the limit, PRs go to a developer.
            </p>
          </div>
          {missing.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">
                {EXECUTE_DELIVERY_LABELS[effectiveDelivery]} is not available yet:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save execution settings"}
          </Button>
          <AlertDialog open={ackOpen} onOpenChange={setAckOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Merge directly to production?</AlertDialogTitle>
                <AlertDialogDescription>
                  When a request matches an allow rule and no escalation, Snag will merge the
                  agent&apos;s PR into <code>{project.repo_ref}</code> as soon as CI passes. Nobody
                  reviews the code first. Built-in escalations, the trusted requester list, and the
                  daily limit of {dailyLimit} still apply.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void save(true)}>
                  I understand, enable auto-merge
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GitHub token</CardTitle>
          <CardDescription>
            Fine-grained token for {project.repo_url}. Needs Contents and Pull requests (read and
            write) plus Checks, Commit statuses, and Deployments (read). Stored encrypted; never
            displayed after save.
            {project.github_token_updated_at ? (
              <> Last updated {new Date(project.github_token_updated_at).toLocaleString()}.</>
            ) : (
              <> Not configured — merge deliveries fall back to PR only.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={saveGithubToken} className="flex gap-2">
            <Input
              type="password"
              placeholder="github_pat_..."
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              className="font-mono"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={savingToken || !githubToken.trim()}
            >
              {savingToken ? "Saving…" : project.github_token_updated_at ? "Replace" : "Save"}
            </Button>
          </form>
          {project.github_token_updated_at ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Remove token
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove the GitHub token?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Snag will stop merging PRs and tracking CI for this project. Delivery falls
                    back to PR only until a new token is added.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void removeGithubToken()}>
                    Remove token
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requester signing secret</CardTitle>
          <CardDescription>
            Your backend signs a short-lived requester token with this secret so Snag can trust
            who filed a request. Required for auto-merge.
            {project.requester_secret_updated_at ? (
              <> Generated {new Date(project.requester_secret_updated_at).toLocaleString()}.</>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {revealedSecret ? (
            <div className="space-y-2 rounded-lg border border-zinc-200 p-4">
              <p className="text-sm font-medium">
                Copy this now — it will not be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-zinc-100 px-2 py-1 text-xs">
                  {revealedSecret}
                </code>
                <CopyButton value={revealedSecret} label="Secret" />
              </div>
            </div>
          ) : null}
          {project.requester_secret_updated_at ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" disabled={generatingSecret}>
                  Rotate secret
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rotate the requester signing secret?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tokens signed with the current secret stop verifying immediately. Requesters
                    will appear unverified until your backend uses the new secret.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void generateSecret()}>
                    Rotate secret
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void generateSecret()}
              disabled={generatingSecret}
            >
              {generatingSecret ? "Generating…" : "Generate secret"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

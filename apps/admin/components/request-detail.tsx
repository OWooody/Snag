"use client";

import {
  PLAN_FLAG_LABELS,
  POLICY_OUTCOME_LABELS,
  stripRequesterQuestionsJson,
  stripSnagPlanSection,
  type PolicyStageDecision,
  type SnagRequestDetailRow,
  type SnagRequestStatus,
} from "@snag/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  ActivityCard,
  ConversationCard,
  PlanPreviewCard,
  RequestDetailsCard,
  RequesterContextCard,
} from "@/components/request-debug-panels";
import { StatusBadge } from "@/components/status-badge";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const ACTIVE_STATUSES: SnagRequestStatus[] = [
  "queued",
  "running",
  "awaiting_requester",
  "awaiting_approval",
  "awaiting_review",
  "awaiting_confirmation",
];

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline">
      {children}
    </a>
  );
}

function StageDecision({ title, decision }: { title: string; decision: PolicyStageDecision }) {
  const enforced = decision.matched.filter((rule) => !rule.shadow);
  const shadow = decision.matched.filter((rule) => rule.shadow);
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{title}</span>
        <Badge variant={decision.outcome === "execute" ? "success" : "warning"}>
          {POLICY_OUTCOME_LABELS[decision.outcome]}
        </Badge>
        {decision.project_shadow ? <Badge variant="outline">Project shadow mode</Badge> : null}
        <span className="text-xs text-zinc-500">
          {new Date(decision.evaluated_at).toLocaleString()}
        </span>
      </div>
      {decision.project_shadow && decision.computed_outcome !== decision.outcome ? (
        <p className="text-sm text-zinc-600">
          Rules alone would have chosen{" "}
          <span className="font-medium">{POLICY_OUTCOME_LABELS[decision.computed_outcome]}</span>.
        </p>
      ) : null}
      {decision.shadow_outcome !== decision.computed_outcome ? (
        <p className="text-sm text-zinc-600">
          With shadow rules enforced:{" "}
          <span className="font-medium">{POLICY_OUTCOME_LABELS[decision.shadow_outcome]}</span>.
        </p>
      ) : null}
      {enforced.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Matched rules
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {enforced.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-2">
                <span>{rule.name}</span>
                <Badge variant="secondary">
                  {rule.kind === "builtin" ? "Built-in" : rule.kind === "allow" ? "Allow" : "Escalate"}
                </Badge>
                <span className="text-xs text-zinc-500">{POLICY_OUTCOME_LABELS[rule.outcome]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No rules matched; the default outcome applied.</p>
      )}
      {shadow.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Shadow matches (not enforced)
          </p>
          <ul className="mt-1 space-y-1 text-sm text-zinc-600">
            {shadow.map((rule) => (
              <li key={rule.id}>
                {rule.name} → {POLICY_OUTCOME_LABELS[rule.outcome]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {decision.reasons.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-zinc-600">
          {decision.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RequestDetail({
  projectSlug,
  requestId,
  canDecide,
}: {
  projectSlug: string;
  requestId: string;
  canDecide: boolean;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState(false);
  const queryKey = ["request", projectSlug, requestId];

  const { data: request, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectSlug}/requests/${requestId}`);
      if (!res.ok) throw new Error(res.status === 404 ? "Request not found" : "Failed to load");
      return (await res.json()) as SnagRequestDetailRow;
    },
    refetchInterval: (query) =>
      query.state.data && ACTIVE_STATUSES.includes(query.state.data.status) ? 30_000 : false,
  });

  async function decide(decision: "approve" | "reject" | "revise") {
    if (decision === "revise" && !note.trim()) {
      toast.error("Write what the agent should change in the plan first.");
      return;
    }
    setDeciding(true);
    const res = await fetch(`/api/projects/${projectSlug}/requests/${requestId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: note.trim() || undefined }),
    });
    setDeciding(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(typeof body.error === "string" ? body.error : "Decision failed");
      void queryClient.invalidateQueries({ queryKey });
      return;
    }
    toast.success(
      decision === "approve"
        ? "Plan approved — the agent is implementing it"
        : decision === "revise"
          ? "Plan sent back — the agent is revising it"
          : "Plan rejected",
    );
    setNote("");
    queryClient.setQueryData<SnagRequestDetailRow>(queryKey, (current) =>
      current ? { ...current, ...(body as Partial<SnagRequestDetailRow>) } : current,
    );
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ["requests", projectSlug] });
  }

  if (isLoading) return <p className="text-sm text-zinc-500">Loading request…</p>;
  if (error || !request) {
    return <p className="text-sm text-red-600">{error?.message ?? "Request not found"}</p>;
  }

  const decision = request.policy_decision;
  const summary = request.summary
    ? stripRequesterQuestionsJson(stripSnagPlanSection(request.summary))
    : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/requests" className="text-sm text-zinc-500 hover:underline">
          ← Requests
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Request</h1>
          <StatusBadge status={request.status} />
          {request.phase ? <Badge variant="outline">{request.phase}</Badge> : null}
        </div>
        <p className="whitespace-pre-wrap text-zinc-800">{request.prompt}</p>
        <div className="flex flex-wrap gap-4 text-sm text-zinc-500">
          <span>
            Requester: {request.requester ?? "anonymous"}
            {request.requester ? (request.requester_verified ? " (verified)" : " (unverified)") : null}
          </span>
          <span>Created {new Date(request.created_at).toLocaleString()}</span>
          {request.agent_url ? <ExternalLink href={request.agent_url}>Agent</ExternalLink> : null}
          {request.pr_url ? <ExternalLink href={request.pr_url}>Pull request</ExternalLink> : null}
          {request.preview_url ? (
            <ExternalLink href={request.preview_url}>Preview</ExternalLink>
          ) : null}
        </div>
        {request.error ? <p className="text-sm text-red-600">{request.error}</p> : null}
        {request.status === "rejected" && request.rejection_note ? (
          <p className="whitespace-pre-wrap text-sm text-zinc-600">
            Rejection note: {request.rejection_note}
          </p>
        ) : null}
        {request.merged_at ? (
          <p className="text-sm text-emerald-700">
            Merged {new Date(request.merged_at).toLocaleString()}
            {request.merge_commit_sha ? (
              <span className="font-mono"> ({request.merge_commit_sha.slice(0, 7)})</span>
            ) : null}
          </p>
        ) : null}
      </div>

      {request.status === "awaiting_approval" ? (
        <Card>
          <CardHeader>
            <CardTitle>Approve the plan?</CardTitle>
            <CardDescription>
              The agent stopped after planning. Approving sends it back to implement the plan
              below; the resulting PR always waits for a developer to merge. Sending it back asks
              the agent for a revised plan, which the rules check again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canDecide ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="decision_note">Note (optional)</Label>
                  <p className="text-xs text-zinc-500">
                    Sent to the agent when you approve or send the plan back (required for that).
                    Shown to the requester when you reject.
                  </p>
                  <Textarea
                    id="decision_note"
                    rows={3}
                    value={note}
                    maxLength={2000}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void decide("approve")} disabled={deciding}>
                    {deciding ? "Sending…" : "Approve and implement"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void decide("revise")}
                    disabled={deciding || !note.trim()}
                    title={note.trim() ? undefined : "Write what should change first"}
                  >
                    Send back to plan
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="outline" disabled={deciding}>
                        Reject
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reject this plan?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The request ends without changes. The requester sees it as not
                          approved{note.trim() ? ", along with your note," : ""} and can file a
                          new request.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void decide("reject")}>
                          Reject plan
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500">An org admin must approve or reject this plan.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {request.status === "awaiting_review" ? (
        <Card>
          <CardHeader>
            <CardTitle>Waiting for a developer to review the PR</CardTitle>
            <CardDescription>
              Review and merge {request.pr_url ? <ExternalLink href={request.pr_url}>the PR</ExternalLink> : "the PR"}{" "}
              on GitHub. Snag tracks it and marks the request merged or closed.
            </CardDescription>
          </CardHeader>
          {request.handoff_reason ? (
            <CardContent>
              <p className="text-sm text-zinc-700">
                <span className="font-medium">Why it was handed off:</span>{" "}
                {request.handoff_reason}
              </p>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {request.plan ? (
        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            {request.plan.summary ? <CardDescription>{request.plan.summary}</CardDescription> : null}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-500">Risk</span>
              <Badge variant={request.plan.risk === "low" ? "success" : "warning"}>
                {request.plan.risk}
              </Badge>
              {request.plan.flags.map((flag) => (
                <Badge key={flag} variant="destructive">
                  {PLAN_FLAG_LABELS[flag] ?? flag}
                </Badge>
              ))}
            </div>
            {request.plan.changes?.length ? (
              <div>
                <p className="text-zinc-500">What the requester sees change</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {request.plan.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <p className="text-zinc-500">Files ({request.plan.files.length})</p>
              <ul className="mt-1 space-y-0.5 font-mono text-xs">
                {request.plan.files.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <PlanPreviewCard request={request} />

      {decision?.plan || decision?.diff ? (
        <Card>
          <CardHeader>
            <CardTitle>Rule decision</CardTitle>
            <CardDescription>
              {decision.final_outcome
                ? `Final outcome: ${POLICY_OUTCOME_LABELS[decision.final_outcome]}.`
                : "Rules are evaluated on the plan, then again on the PR diff."}
              {decision.note ? ` ${decision.note}.` : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {decision.plan ? <StageDecision title="Plan" decision={decision.plan} /> : null}
            {decision.diff ? <StageDecision title="PR diff" decision={decision.diff} /> : null}
          </CardContent>
        </Card>
      ) : null}

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Agent summary</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap break-words text-sm text-zinc-800">{summary}</pre>
          </CardContent>
        </Card>
      ) : null}

      <ConversationCard projectSlug={projectSlug} request={request} />
      <ActivityCard projectSlug={projectSlug} request={request} />
      <RequesterContextCard request={request} />
      <RequestDetailsCard request={request} />
    </div>
  );
}

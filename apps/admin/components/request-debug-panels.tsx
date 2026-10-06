"use client";

import type {
  AgentConversationMessage,
  SnagRequestActivity,
  SnagRequestDetailRow,
} from "@snag/shared";
import { useQuery } from "@tanstack/react-query";
import { STATUS_LABELS } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDuration,
  inspectProposedPreview,
  requesterReplyFromPrompt,
} from "@/lib/request-debug";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-1 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words text-zinc-800">{children}</dd>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md bg-zinc-50 p-3 font-mono text-xs text-zinc-800">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null;
}

function timestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export function RequestDetailsCard({ request }: { request: SnagRequestDetailRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          <Field label="Request ID">
            <Mono>{request.id}</Mono>
          </Field>
          <Field label="Agent ID">{request.agent_id ? <Mono>{request.agent_id}</Mono> : "—"}</Field>
          <Field label="Branch">{request.branch_name ? <Mono>{request.branch_name}</Mono> : "—"}</Field>
          <Field label="Phase">
            {request.phase ?? "—"}
            {request.phase_started_at ? ` (since ${timestamp(request.phase_started_at)})` : null}
          </Field>
          <Field label="Screenshot">{request.screenshot_included ? "Attached" : "None"}</Field>
          <Field label="Approved">{timestamp(request.approved_at)}</Field>
          <Field label="Confirmed by requester">{timestamp(request.confirmed_at)}</Field>
          <Field label="Last updated">{timestamp(request.updated_at)}</Field>
        </dl>
      </CardContent>
    </Card>
  );
}

export function PlanPreviewCard({ request }: { request: SnagRequestDetailRow }) {
  const proposed = inspectProposedPreview(request.summary);
  const stored = request.plan?.preview ?? null;
  if (!proposed && !stored) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Live preview</CardTitle>
          {stored ? (
            <Badge variant="success">Shown to requester</Badge>
          ) : (
            <Badge variant="destructive">Dropped by Snag</Badge>
          )}
        </div>
        <CardDescription>
          {stored
            ? "Temporary page edits the requester can toggle on while reviewing the plan."
            : "The agent proposed a preview, but it failed validation, so the requester never saw a preview toggle."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {proposed && !proposed.accepted ? (
          <p className="text-red-700">
            {proposed.rejected.length > 0
              ? `Rejected ${proposed.rejected.length === 1 ? "edit" : "edits"}: ${proposed.rejected
                  .map((index) => `#${index + 1}`)
                  .join(", ")} of ${proposed.ops.length}. One invalid edit drops the whole preview (limits: 20 edits, 12 style properties each, no url(), braces, semicolons or backslashes).`
              : "The preview list itself was invalid (empty, not a list, or more than 20 edits)."}
          </p>
        ) : null}
        <JsonBlock value={stored ?? proposed?.ops} />
      </CardContent>
    </Card>
  );
}

export function RequesterContextCard({ request }: { request: SnagRequestDetailRow }) {
  const context = request.context;
  if (!context || Object.keys(context).length === 0) return null;
  const auto = asRecord(context.snag_auto);
  const viewport = asRecord(auto?.viewport);
  const marker = asRecord(context.snag_marker);
  const elements = Array.isArray(context.snag_elements) ? context.snag_elements : [];
  const url = asString(auto?.url);
  const consoleErrors = Array.isArray(auto?.consoleErrors) ? auto.consoleErrors : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Requester context</CardTitle>
        <CardDescription>What the SDK captured from the requester&apos;s page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl>
          <Field label="Page">
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                {url}
              </a>
            ) : (
              (asString(context.route) ?? "—")
            )}
          </Field>
          {asString(context.environment) ? (
            <Field label="Environment">{asString(context.environment)}</Field>
          ) : null}
          {viewport ? (
            <Field label="Viewport">
              {asString(viewport.width)}×{asString(viewport.height)}
              {asString(viewport.dpr) ? ` @${asString(viewport.dpr)}x` : null}
            </Field>
          ) : null}
          {asString(auto?.userAgent) ? (
            <Field label="Browser">
              <Mono>{asString(auto?.userAgent)}</Mono>
            </Field>
          ) : null}
          {asString(auto?.language) || asString(auto?.timezone) ? (
            <Field label="Locale">
              {[asString(auto?.language), asString(auto?.timezone)].filter(Boolean).join(" · ")}
            </Field>
          ) : null}
          {marker ? (
            <Field label="Marker">
              <Mono>{asString(marker.selector) ?? "—"}</Mono>
            </Field>
          ) : null}
        </dl>
        {elements.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Selected elements ({elements.length})
            </p>
            <ul className="mt-1 space-y-2 text-sm">
              {elements.map((raw, index) => {
                const element = asRecord(raw) ?? {};
                return (
                  <li key={index} className="rounded-md border border-zinc-200 p-2">
                    <Mono>
                      &lt;{asString(element.tag) ?? "?"}&gt; {asString(element.selector) ?? ""}
                    </Mono>
                    {asString(element.text) ? (
                      <p className="mt-1 text-zinc-700" dir="auto">
                        {asString(element.text)}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {consoleErrors.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Console errors ({consoleErrors.length})
            </p>
            <JsonBlock value={consoleErrors} />
          </div>
        ) : null}
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500">Raw context</summary>
          <div className="mt-2">
            <JsonBlock value={context} />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

type TimelineEntry =
  | { kind: "transition"; at: string; key: string; label: string; phase: string | null }
  | { kind: "audit"; at: string; key: string; label: string; actor: string | null; metadata: Record<string, unknown> };

export function ActivityCard({
  projectSlug,
  request,
}: {
  projectSlug: string;
  request: SnagRequestDetailRow;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["request-activity", projectSlug, request.id, request.updated_at],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectSlug}/requests/${request.id}/activity`);
      if (!res.ok) throw new Error("Failed to load activity");
      return (await res.json()) as SnagRequestActivity;
    },
  });

  const entries: TimelineEntry[] = [
    ...(data?.transitions ?? []).map((t) => ({
      kind: "transition" as const,
      at: t.at,
      key: `t${t.id}`,
      label: t.from_status
        ? `${STATUS_LABELS[t.from_status] ?? t.from_status} → ${STATUS_LABELS[t.to_status] ?? t.to_status}`
        : `Created as ${STATUS_LABELS[t.to_status] ?? t.to_status}`,
      phase: t.phase,
    })),
    ...(data?.audit ?? []).map((a) => ({
      kind: "audit" as const,
      at: a.created_at,
      key: `a${a.id}`,
      label: a.action,
      actor: a.actor_email,
      metadata: a.metadata,
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Every status change, plus admin actions from the audit log. Time shown is how long the
          request sat in the previous status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-zinc-500">Loading activity…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error.message}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-zinc-500">No activity recorded.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {entries.map((entry, index) => {
              const previous = entries
                .slice(0, index)
                .reverse()
                .find((e) => e.kind === "transition");
              const waited =
                entry.kind === "transition" && previous
                  ? formatDuration(new Date(entry.at).getTime() - new Date(previous.at).getTime())
                  : null;
              const metadata = entry.kind === "audit" ? entry.metadata : null;
              return (
                <li
                  key={entry.key}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-zinc-100 py-2"
                >
                  <span className="w-44 shrink-0 text-xs text-zinc-500">
                    {new Date(entry.at).toLocaleString()}
                  </span>
                  {entry.kind === "transition" ? (
                    <>
                      <span>{entry.label}</span>
                      {entry.phase ? <Badge variant="outline">{entry.phase}</Badge> : null}
                      {waited ? <span className="text-xs text-zinc-400">after {waited}</span> : null}
                    </>
                  ) : (
                    <>
                      <Badge variant="secondary">audit</Badge>
                      <Mono>{entry.label}</Mono>
                      <span className="text-xs text-zinc-500">by {entry.actor ?? "unknown"}</span>
                      {metadata && Object.keys(metadata).length > 0 ? (
                        <Mono>{JSON.stringify(metadata)}</Mono>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function ConversationMessage({
  message,
  isLaunchPrompt,
}: {
  message: AgentConversationMessage;
  isLaunchPrompt: boolean;
}) {
  if (message.role === "assistant") {
    return (
      <li className="rounded-lg border border-zinc-200 p-3">
        <Badge variant="secondary">Agent</Badge>
        <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-800">
          {message.text}
        </pre>
      </li>
    );
  }

  const requester = isLaunchPrompt ? null : requesterReplyFromPrompt(message.text);
  return (
    <li
      className={
        requester
          ? "rounded-lg border border-blue-200 bg-blue-50 p-3"
          : "rounded-lg border border-zinc-200 bg-zinc-50 p-3"
      }
    >
      <Badge variant={requester ? "default" : "outline"}>
        {requester ? requester.label : isLaunchPrompt ? "Snag launch prompt" : "Snag → agent"}
      </Badge>
      {requester ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-900" dir="auto">
          {requester.reply}
        </p>
      ) : null}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-zinc-500">
          {requester ? "Full prompt sent to the agent" : "Show prompt"}
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700">
          {message.text}
        </pre>
      </details>
    </li>
  );
}

export function ConversationCard({
  projectSlug,
  request,
}: {
  projectSlug: string;
  request: SnagRequestDetailRow;
}) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["request-conversation", projectSlug, request.id, request.updated_at],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectSlug}/requests/${request.id}/conversation`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to load conversation");
      }
      return body.messages as AgentConversationMessage[];
    },
    enabled: Boolean(request.agent_id),
    staleTime: 60_000,
    retry: false,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Conversation</CardTitle>
          {request.agent_id ? (
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
        </div>
        <CardDescription>
          Everything Snag sent the agent and every reply, read live from Cursor. Requester replies
          are highlighted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!request.agent_id ? (
          <p className="text-sm text-zinc-500">No agent was launched for this request.</p>
        ) : isLoading ? (
          <p className="text-sm text-zinc-500">Loading conversation…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error.message}</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-zinc-500">No messages yet.</p>
        ) : (
          <ol className="space-y-3">
            {data.map((message, index) => (
              <ConversationMessage
                key={message.id}
                message={message}
                isLaunchPrompt={index === 0 && message.role === "user"}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

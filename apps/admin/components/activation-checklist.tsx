"use client";

import {
  buildActivationChecklist,
  type ActivationFacts,
} from "@/lib/activation-checklist";
import type { AuthProvider, ExecuteDelivery, HostRuntime, SnagProjectSafe } from "@snag/shared";
import { CheckCircle2, ChevronDown, Circle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const selectClassName =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseHost(value: string): HostRuntime | null {
  return value === "vercel" ? "vercel" : null;
}

function parseAuth(value: string): AuthProvider | null {
  return value === "supabase" ? "supabase" : null;
}

export function ActivationChecklist({
  project,
  orgDelivery,
  facts,
}: {
  project: SnagProjectSafe;
  orgDelivery: ExecuteDelivery;
  facts: ActivationFacts;
}) {
  const router = useRouter();
  const [hostRuntime, setHostRuntime] = useState<HostRuntime | null>(project.host_runtime);
  const [authProvider, setAuthProvider] = useState<AuthProvider | null>(project.auth_provider);
  const [saving, setSaving] = useState(false);
  const model = useMemo(
    () =>
      buildActivationChecklist(
        { ...project, host_runtime: hostRuntime, auth_provider: authProvider },
        orgDelivery,
        facts,
      ),
    [project, hostRuntime, authProvider, orgDelivery, facts],
  );
  const [open, setOpen] = useState(!model.complete);

  useEffect(() => {
    setHostRuntime(project.host_runtime);
    setAuthProvider(project.auth_provider);
  }, [project.host_runtime, project.auth_provider]);

  useEffect(() => {
    if (model.complete) setOpen(false);
  }, [model.complete]);

  async function save(nextHost: HostRuntime | null, nextAuth: AuthProvider | null) {
    const previousHost = hostRuntime;
    const previousAuth = authProvider;
    setHostRuntime(nextHost);
    setAuthProvider(nextAuth);
    setSaving(true);
    const res = await fetch(`/api/platform/tenants/${project.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host_runtime: nextHost, auth_provider: nextAuth }),
    });
    setSaving(false);
    if (!res.ok) {
      setHostRuntime(previousHost);
      setAuthProvider(previousAuth);
      toast.error("Failed to save");
      return;
    }
    router.refresh();
  }

  const progress = model.totalCount === 0 ? 0 : Math.round((model.doneCount / model.totalCount) * 100);

  return (
    <Card>
      <div className="p-6 pb-0">
        <CardTitle className="text-base">Activation</CardTitle>
        <CardDescription className="mt-1">
          {model.complete
            ? "All steps are done."
            : `${model.doneCount} of ${model.totalCount} steps done.`}
        </CardDescription>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="activation-host">Where it runs</Label>
            <select
              id="activation-host"
              className={selectClassName}
              value={hostRuntime ?? ""}
              disabled={saving}
              onChange={(event) => void save(parseHost(event.target.value), authProvider)}
            >
              <option value="">Not specified</option>
              <option value="vercel">Vercel</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="activation-auth">How users sign in</Label>
            <select
              id="activation-auth"
              className={selectClassName}
              value={authProvider ?? ""}
              disabled={saving}
              onChange={(event) => void save(hostRuntime, parseAuth(event.target.value))}
            >
              <option value="">Not specified</option>
              <option value="supabase">Supabase Auth</option>
            </select>
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-500">These only change the instructions below.</p>
      </div>

      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group"
      >
        <summary className="cursor-pointer list-none px-6 py-4 text-sm text-zinc-500 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1">
            {open ? "Hide steps" : "Show steps"}
            <ChevronDown
              className="h-4 w-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </span>
        </summary>

        <div className="space-y-6 px-6 pb-6">
          {model.sections.map((section) => (
            <section key={section.id} className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.steps.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    {item.done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" aria-hidden />
                    )}
                    <span className="sr-only">{item.done ? "Done." : "Not done."}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                        <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                        {item.at && item.atLabel ? (
                          <p className="shrink-0 text-xs text-zinc-500">
                            {item.atLabel} {formatWhen(item.at)}
                          </p>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-zinc-500">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <p className="text-sm text-zinc-500">{model.footnote}</p>
        </div>
      </details>
    </Card>
  );
}

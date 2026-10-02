"use client";

import type { ActivationChecklistModel } from "@/lib/activation-checklist";
import { CheckCircle2, ChevronDown, Circle } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivationChecklist({ model }: { model: ActivationChecklistModel }) {
  const [open, setOpen] = useState(!model.complete);

  useEffect(() => {
    if (model.complete) setOpen(false);
  }, [model.complete]);

  const progress = model.totalCount === 0 ? 0 : Math.round((model.doneCount / model.totalCount) * 100);

  return (
    <Card>
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group"
      >
        <summary className="cursor-pointer list-none p-6 [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-base">Activation</CardTitle>
              <CardDescription className="mt-1">
                {model.complete
                  ? "All steps are done."
                  : `${model.doneCount} of ${model.totalCount} steps done.`}
              </CardDescription>
            </div>
            <ChevronDown
              className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: `${progress}%` }}
            />
          </div>
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

          <p className="text-sm text-zinc-500">
            Snag does not record connecting the Cursor account to GitHub, preview deployments on
            pull requests, CI on the production branch, or branch protection that lets the token
            user merge. Those stay outside this list.
          </p>
        </div>
      </details>
    </Card>
  );
}

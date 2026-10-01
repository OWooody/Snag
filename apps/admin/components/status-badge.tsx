"use client";

import type { SnagRequestStatus } from "@snag/shared";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<
  SnagRequestStatus,
  "secondary" | "warning" | "success" | "destructive" | "default"
> = {
  queued: "secondary",
  running: "warning",
  needs_input: "warning",
  awaiting_approval: "default",
  awaiting_review: "default",
  awaiting_confirmation: "warning",
  finished: "success",
  merged: "success",
  error: "destructive",
  rejected: "secondary",
};

export const STATUS_LABELS: Record<SnagRequestStatus, string> = {
  queued: "queued",
  running: "running",
  needs_input: "needs input",
  awaiting_approval: "awaiting approval",
  awaiting_review: "awaiting review",
  awaiting_confirmation: "awaiting requester",
  finished: "finished",
  merged: "merged",
  error: "error",
  rejected: "rejected",
};

export function StatusBadge({ status }: { status: SnagRequestStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>{STATUS_LABELS[status] ?? status}</Badge>
  );
}

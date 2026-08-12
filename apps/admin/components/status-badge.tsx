"use client";

import type { SnagRequestStatus } from "@snag/shared";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<
  SnagRequestStatus,
  "secondary" | "warning" | "success" | "destructive"
> = {
  queued: "secondary",
  running: "warning",
  needs_input: "warning",
  finished: "success",
  error: "destructive",
};

export function StatusBadge({ status }: { status: SnagRequestStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

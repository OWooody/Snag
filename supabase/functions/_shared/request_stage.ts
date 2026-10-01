/**
 * Short, requester-facing description of where an in-progress execute-mode
 * request is. Returned by the relay as `stage_label`; null when the status
 * label already says enough.
 */

import type { LifecycleRow } from "./lifecycle.ts";

export function requestStageLabel(
  row: Pick<LifecycleRow, "status" | "phase" | "confirmed_at" | "policy_decision">,
): string | null {
  if (row.status !== "running") return null;
  switch (row.phase) {
    case "planning":
      return "Planning";
    case "implementing":
      return "Building";
    case "delivering": {
      const delivery = row.policy_decision?.diff?.delivery;
      if (delivery === "preview_confirm" && !row.confirmed_at) return "Waiting for preview";
      return "Waiting for checks";
    }
    default:
      return null;
  }
}

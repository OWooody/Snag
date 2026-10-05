/**
 * Parse the "## Snag plan" block agents emit at the end of the planning phase.
 * Mirrored in packages/shared/src/execute-policy.ts — keep in sync
 * (Deno edge functions cannot import the npm package).
 */

export const SNAG_PLAN_HEADING = "## Snag plan";

export const PLAN_RISKS = ["low", "medium", "high"] as const;
export type PlanRisk = (typeof PLAN_RISKS)[number];

export const PLAN_FLAGS = [
  "schema",
  "auth",
  "payments",
  "dependency",
  "infrastructure",
  "security",
  "data_deletion",
  "public_api",
] as const;
export type PlanFlag = (typeof PLAN_FLAGS)[number];

export interface SnagPlan {
  files: string[];
  risk: PlanRisk;
  flags: PlanFlag[];
  summary: string | null;
  /** Plain-language bullets for the requester. Omitted when the agent gave none. */
  changes?: string[];
}

const MAX_PLAN_FILES = 200;
const MAX_PLAN_CHANGES = 8;
const MAX_PLAN_CHANGE_LENGTH = 200;

export function parseSnagPlan(summary: string | null | undefined): SnagPlan | null {
  if (!summary) return null;
  const headingIndex = summary.lastIndexOf(SNAG_PLAN_HEADING);
  if (headingIndex < 0) return null;
  const section = summary.slice(headingIndex + SNAG_PLAN_HEADING.length);
  const fence = section.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (!fence) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(fence[1]);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  if (!Array.isArray(value.files)) return null;
  const files = value.files
    .filter((file): file is string => typeof file === "string")
    .map(normalizeRepoPath)
    .filter((file) => file.length > 0);
  if (files.length > MAX_PLAN_FILES) return null;

  const risk = (PLAN_RISKS as readonly string[]).includes(value.risk as string)
    ? (value.risk as PlanRisk)
    : null;
  if (!risk) return null;

  const flags = Array.isArray(value.flags)
    ? value.flags.filter((flag): flag is PlanFlag =>
      (PLAN_FLAGS as readonly string[]).includes(flag as string)
    )
    : [];

  const planSummary = typeof value.summary === "string" && value.summary.trim()
    ? value.summary.trim().slice(0, 500)
    : null;

  const changes = parsePlanChanges(value.changes);

  return {
    files: [...new Set(files)],
    risk,
    flags: [...new Set(flags)],
    summary: planSummary,
    ...(changes.length > 0 ? { changes } : {}),
  };
}

function parsePlanChanges(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((change): change is string => typeof change === "string")
    .map((change) => change.trim().slice(0, MAX_PLAN_CHANGE_LENGTH))
    .filter((change) => change.length > 0)
    .slice(0, MAX_PLAN_CHANGES);
}

export function normalizeRepoPath(path: string): string {
  return path.trim().replace(/^\.\//, "").replace(/^\/+/, "");
}

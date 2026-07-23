export type AgentMode = "plan_only" | "execute";

export const AGENT_MODES = ["plan_only", "execute"] as const satisfies readonly AgentMode[];

export const DEFAULT_AGENT_MODE: AgentMode = "plan_only";

export const AGENT_MODE_LABELS: Record<AgentMode, string> = {
  plan_only: "Plan only",
  execute: "Plan and execute",
};

export const AGENT_MODE_DESCRIPTIONS: Record<AgentMode, string> = {
  plan_only: "Agent analyzes the codebase and returns a plan. Developers implement manually.",
  execute: "Agent may implement small, unambiguous changes and open a PR.",
};

export function resolveEffectiveAgentMode(
  projectMode: AgentMode | null | undefined,
  orgMode: AgentMode | null | undefined,
): AgentMode {
  return projectMode ?? orgMode ?? DEFAULT_AGENT_MODE;
}

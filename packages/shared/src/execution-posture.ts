import type { AgentMode } from "./agent-mode";
import type { ExecuteDelivery, PolicyOutcome } from "./execute-policy";

/**
 * The two simple choices on organization and project settings.
 * Each one is a fixed combination of the existing agent, delivery, outcome,
 * and shadow settings. Anything else is custom and stays under Advanced.
 */
export type ExecutionPosture = "review_required" | "execute_within_rules";

export type ClassifiedExecutionPosture = ExecutionPosture | "custom";

export interface ExecutionPostureInput {
  agent_mode: AgentMode;
  execute_delivery: ExecuteDelivery;
  default_outcome: PolicyOutcome;
  policy_shadow_mode: boolean;
}

export const EXECUTION_POSTURE_LABELS: Record<ExecutionPosture, string> = {
  review_required: "Review required",
  execute_within_rules: "Execute to production if within rules",
};

export const EXECUTION_POSTURE_DESCRIPTIONS: Record<ExecutionPosture, string> = {
  review_required:
    "A developer approves the plan before the agent writes code, and a developer merges the pull request.",
  execute_within_rules:
    "When a request matches an allow rule and no escalation, Snag merges it once CI passes. Anything outside those rules waits for a developer.",
};

/** Agent implements after plan approval; a developer merges the pull request. */
export const REVIEW_REQUIRED_POSTURE: ExecutionPostureInput = {
  agent_mode: "execute",
  execute_delivery: "pr_only",
  default_outcome: "review_before_execution",
  policy_shadow_mode: false,
};

/** Ship only when an allow rule matches and nothing escalates. */
export const EXECUTE_WITHIN_RULES_POSTURE: ExecutionPostureInput = {
  agent_mode: "execute",
  execute_delivery: "auto_merge",
  default_outcome: "review_before_execution",
  policy_shadow_mode: false,
};

const POSTURE_SETTINGS: Record<ExecutionPosture, ExecutionPostureInput> = {
  review_required: REVIEW_REQUIRED_POSTURE,
  execute_within_rules: EXECUTE_WITHIN_RULES_POSTURE,
};

export function executionPostureSettings(posture: ExecutionPosture): ExecutionPostureInput {
  return POSTURE_SETTINGS[posture];
}

function samePosture(left: ExecutionPostureInput, right: ExecutionPostureInput): boolean {
  return (
    left.agent_mode === right.agent_mode &&
    left.execute_delivery === right.execute_delivery &&
    left.default_outcome === right.default_outcome &&
    left.policy_shadow_mode === right.policy_shadow_mode
  );
}

export function classifyExecutionPosture(
  settings: ExecutionPostureInput,
): ClassifiedExecutionPosture {
  if (samePosture(settings, REVIEW_REQUIRED_POSTURE)) return "review_required";
  if (samePosture(settings, EXECUTE_WITHIN_RULES_POSTURE)) return "execute_within_rules";
  return "custom";
}

export interface ProjectPostureOverrides {
  agent_mode: AgentMode | null;
  execute_delivery: ExecuteDelivery | null;
  default_outcome: PolicyOutcome | null;
  policy_shadow_mode: boolean | null;
}

/** Inherit when every override is unset. A partial override is custom. */
export type ProjectPostureChoice = "inherit" | ClassifiedExecutionPosture;

export function classifyProjectPosture(overrides: ProjectPostureOverrides): ProjectPostureChoice {
  const values = [
    overrides.agent_mode,
    overrides.execute_delivery,
    overrides.default_outcome,
    overrides.policy_shadow_mode,
  ];
  if (values.every((value) => value == null)) return "inherit";
  if (values.some((value) => value == null)) return "custom";
  return classifyExecutionPosture({
    agent_mode: overrides.agent_mode as AgentMode,
    execute_delivery: overrides.execute_delivery as ExecuteDelivery,
    default_outcome: overrides.default_outcome as PolicyOutcome,
    policy_shadow_mode: overrides.policy_shadow_mode as boolean,
  });
}

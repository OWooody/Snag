import {
  AGENT_MODE_DESCRIPTIONS,
  AGENT_MODE_LABELS,
  AGENT_MODES,
  type AgentMode,
} from "@snag/shared";
import { Label } from "@/components/ui/label";

const selectClassName =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function AgentModeSelect({
  id,
  value,
  onChange,
  description,
}: {
  id: string;
  value: AgentMode;
  onChange: (value: AgentMode) => void;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Agent mode</Label>
      <select
        id={id}
        className={selectClassName}
        value={value}
        onChange={(e) => onChange(e.target.value as AgentMode)}
      >
        {AGENT_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {AGENT_MODE_LABELS[mode]}
          </option>
        ))}
      </select>
      <p className="text-sm text-zinc-500">{description ?? AGENT_MODE_DESCRIPTIONS[value]}</p>
    </div>
  );
}

export function ProjectAgentModeOverrideSelect({
  id,
  value,
  onChange,
  orgDefault,
}: {
  id: string;
  value: AgentMode | "inherit";
  onChange: (value: AgentMode | "inherit") => void;
  orgDefault: AgentMode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Agent mode override</Label>
      <select
        id={id}
        className={selectClassName}
        value={value}
        onChange={(e) => onChange(e.target.value as AgentMode | "inherit")}
      >
        <option value="inherit">Inherit from organization ({AGENT_MODE_LABELS[orgDefault]})</option>
        {AGENT_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {AGENT_MODE_LABELS[mode]}
          </option>
        ))}
      </select>
      <p className="text-sm text-zinc-500">
        {value === "inherit"
          ? `Uses the organization default: ${AGENT_MODE_DESCRIPTIONS[orgDefault]}`
          : AGENT_MODE_DESCRIPTIONS[value]}
      </p>
    </div>
  );
}

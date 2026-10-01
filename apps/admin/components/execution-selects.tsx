import {
  EXECUTE_DELIVERIES,
  EXECUTE_DELIVERY_DESCRIPTIONS,
  EXECUTE_DELIVERY_LABELS,
  POLICY_OUTCOMES,
  POLICY_OUTCOME_DESCRIPTIONS,
  POLICY_OUTCOME_LABELS,
  type ExecuteDelivery,
  type PolicyOutcome,
} from "@snag/shared";
import { Label } from "@/components/ui/label";

export const selectClassName =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

interface OptionSet<T extends string> {
  values: readonly T[];
  labels: Record<T, string>;
  descriptions: Record<T, string>;
}

const DELIVERY_OPTIONS: OptionSet<ExecuteDelivery> = {
  values: EXECUTE_DELIVERIES,
  labels: EXECUTE_DELIVERY_LABELS,
  descriptions: EXECUTE_DELIVERY_DESCRIPTIONS,
};

const OUTCOME_OPTIONS: OptionSet<PolicyOutcome> = {
  values: POLICY_OUTCOMES,
  labels: POLICY_OUTCOME_LABELS,
  descriptions: POLICY_OUTCOME_DESCRIPTIONS,
};

function ValueSelect<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: OptionSet<T>;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={selectClassName}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.values.map((option) => (
          <option key={option} value={option}>
            {options.labels[option]}
          </option>
        ))}
      </select>
      <p className="text-sm text-zinc-500">{options.descriptions[value]}</p>
    </div>
  );
}

function OverrideSelect<T extends string>({
  id,
  label,
  value,
  onChange,
  orgDefault,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: T | "inherit";
  onChange: (value: T | "inherit") => void;
  orgDefault: T;
  options: OptionSet<T>;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={selectClassName}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T | "inherit")}
      >
        <option value="inherit">Inherit from organization ({options.labels[orgDefault]})</option>
        {options.values.map((option) => (
          <option key={option} value={option}>
            {options.labels[option]}
          </option>
        ))}
      </select>
      <p className="text-sm text-zinc-500">
        {value === "inherit"
          ? `Uses the organization default: ${options.descriptions[orgDefault]}`
          : options.descriptions[value]}
      </p>
    </div>
  );
}

export function ExecuteDeliverySelect(props: {
  id: string;
  value: ExecuteDelivery;
  onChange: (value: ExecuteDelivery) => void;
  disabled?: boolean;
}) {
  return <ValueSelect {...props} label="Delivery" options={DELIVERY_OPTIONS} />;
}

export function DefaultOutcomeSelect(props: {
  id: string;
  value: PolicyOutcome;
  onChange: (value: PolicyOutcome) => void;
  disabled?: boolean;
}) {
  return (
    <ValueSelect
      {...props}
      label="When no allow rule matches"
      options={OUTCOME_OPTIONS}
    />
  );
}

export function ProjectExecuteDeliveryOverrideSelect(props: {
  id: string;
  value: ExecuteDelivery | "inherit";
  onChange: (value: ExecuteDelivery | "inherit") => void;
  orgDefault: ExecuteDelivery;
  disabled?: boolean;
}) {
  return <OverrideSelect {...props} label="Delivery override" options={DELIVERY_OPTIONS} />;
}

export function ProjectDefaultOutcomeOverrideSelect(props: {
  id: string;
  value: PolicyOutcome | "inherit";
  onChange: (value: PolicyOutcome | "inherit") => void;
  orgDefault: PolicyOutcome;
  disabled?: boolean;
}) {
  return (
    <OverrideSelect
      {...props}
      label="Default outcome override"
      options={OUTCOME_OPTIONS}
    />
  );
}

export function ShadowModeOverrideSelect({
  id,
  value,
  onChange,
  orgDefault,
  disabled,
}: {
  id: string;
  value: boolean | "inherit";
  onChange: (value: boolean | "inherit") => void;
  orgDefault: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Shadow mode override</Label>
      <select
        id={id}
        className={selectClassName}
        value={value === "inherit" ? "inherit" : value ? "on" : "off"}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === "inherit" ? "inherit" : e.target.value === "on")
        }
      >
        <option value="inherit">Inherit from organization ({orgDefault ? "On" : "Off"})</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
      <p className="text-sm text-zinc-500">{SHADOW_MODE_DESCRIPTION}</p>
    </div>
  );
}

export const SHADOW_MODE_DESCRIPTION =
  "When on, rules are evaluated and recorded but every request waits for a developer. Use it to see what rules would do before trusting them.";

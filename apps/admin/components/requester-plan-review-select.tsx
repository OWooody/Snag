import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const selectClassName =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const DESCRIPTION =
  "In execute mode, requesters see the plan in plain language and approve it or ask for changes before Snag's rules run.";

export function RequesterPlanReviewSwitch({
  id,
  checked,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-4">
      <div>
        <Label htmlFor={id} className="font-medium">
          Requester plan review
        </Label>
        <p className="text-sm text-zinc-500">{DESCRIPTION}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function ProjectRequesterPlanReviewOverrideSelect({
  id,
  value,
  onChange,
  orgDefault,
}: {
  id: string;
  value: boolean | "inherit";
  onChange: (value: boolean | "inherit") => void;
  orgDefault: boolean;
}) {
  const selectValue = value === "inherit" ? "inherit" : value ? "enabled" : "disabled";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Requester plan review override</Label>
      <select
        id={id}
        className={selectClassName}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "inherit") onChange("inherit");
          else onChange(next === "enabled");
        }}
      >
        <option value="inherit">Inherit from organization ({orgDefault ? "On" : "Off"})</option>
        <option value="enabled">On</option>
        <option value="disabled">Off</option>
      </select>
      <p className="text-sm text-zinc-500">
        {value === "inherit"
          ? `Uses the organization default (${orgDefault ? "on" : "off"}).`
          : value
            ? "Plans wait for the requester to approve them before Snag's rules run."
            : "Plans go straight to Snag's rules."}
      </p>
    </div>
  );
}

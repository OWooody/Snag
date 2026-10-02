"use client";

import {
  EXECUTION_POSTURE_DESCRIPTIONS,
  EXECUTION_POSTURE_LABELS,
  type ClassifiedExecutionPosture,
  type ExecutionPosture,
} from "@snag/shared";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";

export type PosturePickerValue = "inherit" | ClassifiedExecutionPosture;

const PRESETS: ExecutionPosture[] = ["review_required", "execute_within_rules"];

export function ExecutionPosturePicker({
  name,
  value,
  onChange,
  inherit,
}: {
  name: string;
  value: PosturePickerValue;
  onChange: (value: "inherit" | ExecutionPosture) => void;
  inherit?: { label: string; description: string };
}) {
  const autoId = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-zinc-900">How requests are handled</legend>
      {inherit ? (
        <PostureOption
          name={name}
          id={`${autoId}-inherit`}
          checked={value === "inherit"}
          onSelect={() => onChange("inherit")}
          label={inherit.label}
          description={inherit.description}
        />
      ) : null}
      {PRESETS.map((posture) => (
        <PostureOption
          key={posture}
          name={name}
          id={`${autoId}-${posture}`}
          checked={value === posture}
          onSelect={() => onChange(posture)}
          label={EXECUTION_POSTURE_LABELS[posture]}
          description={EXECUTION_POSTURE_DESCRIPTIONS[posture]}
        />
      ))}
      {value === "custom" ? (
        <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-4">
          <p className="font-medium text-zinc-900">Custom</p>
          <p className="mt-1 text-sm text-zinc-500">
            Advanced settings are in effect. Choose a simple option to replace them.
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}

function PostureOption({
  id,
  name,
  checked,
  onSelect,
  label,
  description,
}: {
  id: string;
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  description: string;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${
        checked ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:border-zinc-300"
      }`}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-1"
      />
      <span>
        <span className="block font-medium text-zinc-900">{label}</span>
        <span className="mt-1 block text-sm text-zinc-500">{description}</span>
      </span>
    </label>
  );
}

export function AdvancedDisclosure({
  openWhen,
  children,
}: {
  /** Opens the section when this becomes true, such as when the choice is custom. */
  openWhen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(openWhen);
  useEffect(() => {
    if (openWhen) setOpen(true);
  }, [openWhen]);

  return (
    <div className="rounded-lg border border-zinc-200">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-zinc-900"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Advanced
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-zinc-200 px-4 py-4">
          <p className="text-sm text-zinc-500">
            The simple options set these. Changing one switches the choice above to Custom.
          </p>
          {children}
        </div>
      ) : null}
    </div>
  );
}

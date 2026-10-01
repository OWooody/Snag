"use client";

import {
  BUILTIN_POLICY_RULES,
  PLAN_FLAGS,
  PLAN_FLAG_LABELS,
  PLAN_RISKS,
  POLICY_CONDITION_LABELS,
  POLICY_OUTCOME_LABELS,
  type PolicyCondition,
  type PolicyConditionType,
  type PolicyOutcome,
  type PolicyRuleKind,
  type SnagPolicyRule,
} from "@snag/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { selectClassName } from "@/components/execution-selects";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const CONDITION_TYPES = Object.keys(POLICY_CONDITION_LABELS) as PolicyConditionType[];

type EscalationOutcome = Exclude<PolicyOutcome, "execute">;

export function describeCondition(condition: PolicyCondition): string {
  const label = POLICY_CONDITION_LABELS[condition.type];
  switch (condition.type) {
    case "path_glob_any":
    case "path_glob_all":
      return `${label}: ${condition.globs.join(", ")}`;
    case "max_files":
    case "max_lines":
      return label.replace("N", String(condition.max));
    case "risk_at_least":
      return `${label} ${condition.level}`;
    case "flag":
      return `${label} “${PLAN_FLAG_LABELS[condition.flag]}”`;
    default:
      return label;
  }
}

function defaultCondition(type: PolicyConditionType): PolicyCondition {
  switch (type) {
    case "path_glob_any":
    case "path_glob_all":
      return { type, globs: [] };
    case "max_files":
      return { type, max: 5 };
    case "max_lines":
      return { type, max: 200 };
    case "risk_at_least":
      return { type, level: "medium" };
    case "flag":
      return { type, flag: "schema" };
    case "requester_unverified":
      return { type: "requester_unverified" };
    case "requester_not_trusted":
      return { type: "requester_not_trusted" };
  }
}

function ConditionEditor({
  condition,
  onChange,
  onRemove,
  canRemove,
}: {
  condition: PolicyCondition;
  onChange: (condition: PolicyCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [globText, setGlobText] = useState(
    "globs" in condition ? condition.globs.join(", ") : "",
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-start">
      <select
        className={`${selectClassName} sm:w-72`}
        value={condition.type}
        onChange={(e) => {
          const next = defaultCondition(e.target.value as PolicyConditionType);
          setGlobText("");
          onChange(next);
        }}
      >
        {CONDITION_TYPES.map((type) => (
          <option key={type} value={type}>
            {POLICY_CONDITION_LABELS[type]}
          </option>
        ))}
      </select>
      <div className="flex-1">
        {condition.type === "path_glob_any" || condition.type === "path_glob_all" ? (
          <Input
            placeholder="src/components/**, *.css"
            value={globText}
            onChange={(e) => {
              setGlobText(e.target.value);
              onChange({
                ...condition,
                globs: e.target.value
                  .split(/[\n,]/)
                  .map((glob) => glob.trim())
                  .filter(Boolean),
              });
            }}
            className="font-mono"
          />
        ) : condition.type === "max_files" || condition.type === "max_lines" ? (
          <Input
            type="number"
            min={0}
            value={condition.max}
            onChange={(e) => onChange({ ...condition, max: Math.max(0, Number(e.target.value) || 0) })}
          />
        ) : condition.type === "risk_at_least" ? (
          <select
            className={selectClassName}
            value={condition.level}
            onChange={(e) =>
              onChange({ ...condition, level: e.target.value as (typeof PLAN_RISKS)[number] })
            }
          >
            {PLAN_RISKS.map((risk) => (
              <option key={risk} value={risk}>
                {risk}
              </option>
            ))}
          </select>
        ) : condition.type === "flag" ? (
          <select
            className={selectClassName}
            value={condition.flag}
            onChange={(e) =>
              onChange({ ...condition, flag: e.target.value as (typeof PLAN_FLAGS)[number] })
            }
          >
            {PLAN_FLAGS.map((flag) => (
              <option key={flag} value={flag}>
                {PLAN_FLAG_LABELS[flag]}
              </option>
            ))}
          </select>
        ) : (
          <p className="py-2 text-sm text-zinc-500">No value needed.</p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label="Remove condition"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function NewRuleForm({ projectSlug, onCreated }: { projectSlug: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PolicyRuleKind>("allow");
  const [escalation, setEscalation] = useState<EscalationOutcome>("review_before_merge");
  const [scope, setScope] = useState<"project" | "organization">("project");
  const [shadow, setShadow] = useState(false);
  const [conditions, setConditions] = useState<PolicyCondition[]>([
    defaultCondition("path_glob_all"),
  ]);
  const [conditionKeys, setConditionKeys] = useState<number[]>([0]);
  const [nextKey, setNextKey] = useState(1);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setKind("allow");
    setEscalation("review_before_merge");
    setScope("project");
    setShadow(false);
    setConditions([defaultCondition("path_glob_all")]);
    setConditionKeys([nextKey]);
    setNextKey(nextKey + 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/projects/${projectSlug}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        kind,
        outcome: kind === "allow" ? "execute" : escalation,
        scope,
        enabled: true,
        shadow,
        condition: { all: conditions },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(
        typeof body.error === "string"
          ? body.error
          : "Check the rule: every condition needs a value.",
      );
      return;
    }
    toast.success("Rule created");
    reset();
    onCreated();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="rule_name">Name</Label>
          <Input
            id="rule_name"
            placeholder="Copy and styling changes"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule_scope">Applies to</Label>
          <select
            id="rule_scope"
            className={selectClassName}
            value={scope}
            onChange={(e) => setScope(e.target.value as "project" | "organization")}
          >
            <option value="project">This project</option>
            <option value="organization">Every project in the organization</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule_kind">When it matches</Label>
          <select
            id="rule_kind"
            className={selectClassName}
            value={kind === "allow" ? "allow" : escalation}
            onChange={(e) => {
              if (e.target.value === "allow") {
                setKind("allow");
              } else {
                setKind("escalate");
                setEscalation(e.target.value as EscalationOutcome);
              }
            }}
          >
            <option value="allow">Allow: {POLICY_OUTCOME_LABELS.execute}</option>
            <option value="review_before_merge">
              Escalate: {POLICY_OUTCOME_LABELS.review_before_merge}
            </option>
            <option value="review_before_execution">
              Escalate: {POLICY_OUTCOME_LABELS.review_before_execution}
            </option>
          </select>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
          <div>
            <p className="text-sm font-medium">Shadow</p>
            <p className="text-xs text-zinc-500">Record matches without enforcing.</p>
          </div>
          <Switch checked={shadow} onCheckedChange={setShadow} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Conditions (all must match)</Label>
        {conditions.map((condition, index) => (
          <ConditionEditor
            key={conditionKeys[index]}
            condition={condition}
            canRemove={conditions.length > 1}
            onChange={(next) =>
              setConditions(conditions.map((c, i) => (i === index ? next : c)))
            }
            onRemove={() => {
              setConditions(conditions.filter((_, i) => i !== index));
              setConditionKeys(conditionKeys.filter((_, i) => i !== index));
            }}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={conditions.length >= 10}
          onClick={() => {
            setConditions([...conditions, defaultCondition("max_files")]);
            setConditionKeys([...conditionKeys, nextKey]);
            setNextKey(nextKey + 1);
          }}
        >
          <Plus className="h-4 w-4" />
          Add condition
        </Button>
      </div>
      <Button type="submit" disabled={saving || !name.trim()}>
        {saving ? "Creating…" : "Create rule"}
      </Button>
    </form>
  );
}

function RuleRow({
  rule,
  projectSlug,
  canEdit,
  onChanged,
}: {
  rule: SnagPolicyRule;
  projectSlug: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const toggle = useMutation({
    mutationFn: async (changes: { enabled?: boolean; shadow?: boolean }) => {
      const res = await fetch(`/api/projects/${projectSlug}/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error("Failed to update rule");
    },
    onSuccess: onChanged,
    onError: (error: Error) => toast.error(error.message),
  });

  async function remove() {
    const res = await fetch(`/api/projects/${projectSlug}/rules/${rule.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete rule");
      return;
    }
    toast.success("Rule deleted");
    onChanged();
  }

  return (
    <li className="space-y-2 border-b border-zinc-100 py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{rule.name}</span>
        <Badge variant={rule.kind === "allow" ? "success" : "warning"}>
          {rule.kind === "allow" ? "Allow" : "Escalate"} → {POLICY_OUTCOME_LABELS[rule.outcome]}
        </Badge>
        <Badge variant="secondary">{rule.project_id ? "Project" : "Organization"}</Badge>
        {rule.shadow ? <Badge variant="outline">Shadow</Badge> : null}
        {!rule.enabled ? <Badge variant="outline">Disabled</Badge> : null}
      </div>
      <ul className="list-disc pl-5 text-sm text-zinc-600">
        {(rule.condition?.all ?? []).map((condition, index) => (
          <li key={index}>{describeCondition(condition)}</li>
        ))}
      </ul>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Switch
              checked={rule.enabled}
              disabled={toggle.isPending}
              onCheckedChange={(enabled) => toggle.mutate({ enabled })}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={rule.shadow}
              disabled={toggle.isPending}
              onCheckedChange={(shadow) => toggle.mutate({ shadow })}
            />
            Shadow
          </label>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{rule.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  {rule.project_id
                    ? "This rule stops applying to this project."
                    : "This organization-wide rule stops applying to every project."}{" "}
                  Requests already decided keep their recorded decision.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void remove()}>Delete rule</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </li>
  );
}

export function RulesManager({ projectSlug, canEdit }: { projectSlug: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["policy-rules", projectSlug],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectSlug}/rules`);
      if (!res.ok) throw new Error("Failed to load rules");
      return ((await res.json()) as { rules: SnagPolicyRule[] }).rules;
    },
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["policy-rules", projectSlug] });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Custom rules</CardTitle>
          <CardDescription>
            Allow rules let matching requests execute without a developer. Escalation rules force
            a review. When several rules match, the strictest outcome wins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-zinc-500">Loading rules…</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No custom rules yet. Every execute request uses the default outcome.
            </p>
          ) : (
            <ul>
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  projectSlug={projectSlug}
                  canEdit={canEdit}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>New rule</CardTitle>
            <CardDescription>
              Conditions are checked against the agent&apos;s plan, then again against the PR
              diff before anything merges.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewRuleForm projectSlug={projectSlug} onCreated={refresh} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Built-in rules</CardTitle>
          <CardDescription>Always on. Custom rules cannot relax them.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {BUILTIN_POLICY_RULES.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Lock className="h-4 w-4 text-zinc-400" />
                <span>{rule.name}</span>
                <Badge variant="warning">{POLICY_OUTCOME_LABELS[rule.outcome]}</Badge>
                <span className="text-xs text-zinc-500">{rule.appliesTo}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

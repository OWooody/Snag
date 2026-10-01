"use client";

import {
  POLICY_OUTCOME_LABELS,
  POLICY_TEMPLATES,
  type PolicyCondition,
  type PolicyOutcome,
  type PolicyTemplate,
  type SnagPolicyRule,
} from "@snag/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { selectClassName } from "@/components/execution-selects";
import { ConditionEditor, defaultCondition } from "@/components/rules-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface DraftCondition {
  key: number;
  condition: PolicyCondition;
}

interface DraftRule {
  key: number;
  name: string;
  outcome: PolicyOutcome;
  conditions: DraftCondition[];
  note?: string;
  checkPaths?: boolean;
}

let nextDraftKey = 0;
const draftKey = () => (nextDraftKey += 1);

function draftFromTemplate(template: PolicyTemplate): DraftRule[] {
  return template.rules.map((rule) => ({
    key: draftKey(),
    name: rule.name,
    outcome: rule.outcome,
    conditions: rule.condition.all.map((condition) => ({
      key: draftKey(),
      condition: structuredClone(condition),
    })),
    note: rule.note,
    checkPaths: rule.checkPaths,
  }));
}

function TemplateCard({
  template,
  onUse,
}: {
  template: PolicyTemplate;
  onUse: () => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <Zap className="h-4 w-4 text-amber-500" />
            {template.name}
          </p>
          <p className="mt-1 text-sm text-zinc-600">{template.tagline}</p>
        </div>
        <Button type="button" variant="outline" onClick={onUse}>
          Use this template
        </Button>
      </div>
      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 font-medium text-zinc-700">Ships automatically</p>
          <ul className="space-y-1 text-zinc-600">
            {template.allows.map((item) => (
              <li key={item} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 font-medium text-zinc-700">Waits for a developer</p>
          <ul className="space-y-1 text-zinc-600">
            {template.holds.map((item) => (
              <li key={item} className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function DraftRuleEditor({
  rule,
  duplicate,
  onChange,
  onRemove,
}: {
  rule: DraftRule;
  duplicate: boolean;
  onChange: (rule: DraftRule) => void;
  onRemove: () => void;
}) {
  const isAllow = rule.outcome === "execute";
  return (
    <li className="space-y-3 rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`draft_name_${rule.key}`}>Name</Label>
          <Input
            id={`draft_name_${rule.key}`}
            value={rule.name}
            onChange={(e) => onChange({ ...rule, name: e.target.value })}
          />
        </div>
        <div className="space-y-1 sm:w-72">
          <Label htmlFor={`draft_outcome_${rule.key}`}>When it matches</Label>
          {isAllow ? (
            <p id={`draft_outcome_${rule.key}`} className="py-2 text-sm">
              Allow: {POLICY_OUTCOME_LABELS.execute}
            </p>
          ) : (
            <select
              id={`draft_outcome_${rule.key}`}
              className={selectClassName}
              value={rule.outcome}
              onChange={(e) => onChange({ ...rule, outcome: e.target.value as PolicyOutcome })}
            >
              <option value="review_before_merge">
                Escalate: {POLICY_OUTCOME_LABELS.review_before_merge}
              </option>
              <option value="review_before_execution">
                Escalate: {POLICY_OUTCOME_LABELS.review_before_execution}
              </option>
            </select>
          )}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
          Remove
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {rule.checkPaths ? (
          <Badge variant="warning">Check these paths match your repository</Badge>
        ) : null}
        {duplicate ? (
          <Badge variant="outline">A rule with this name already exists</Badge>
        ) : null}
      </div>
      {rule.note ? <p className="text-sm text-zinc-500">{rule.note}</p> : null}
      <div className="space-y-2">
        <Label>Conditions (all must match)</Label>
        {rule.conditions.map((draft) => (
          <ConditionEditor
            key={draft.key}
            condition={draft.condition}
            canRemove={rule.conditions.length > 1}
            onChange={(condition) =>
              onChange({
                ...rule,
                conditions: rule.conditions.map((c) =>
                  c.key === draft.key ? { ...c, condition } : c,
                ),
              })
            }
            onRemove={() =>
              onChange({
                ...rule,
                conditions: rule.conditions.filter((c) => c.key !== draft.key),
              })
            }
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rule.conditions.length >= 10}
          onClick={() =>
            onChange({
              ...rule,
              conditions: [
                ...rule.conditions,
                { key: draftKey(), condition: defaultCondition("max_files") },
              ],
            })
          }
        >
          <Plus className="h-4 w-4" />
          Add condition
        </Button>
      </div>
    </li>
  );
}

export function RuleTemplates({ projectSlug }: { projectSlug: string }) {
  const queryClient = useQueryClient();
  const { data: existing = [] } = useQuery({
    queryKey: ["policy-rules", projectSlug],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectSlug}/rules`);
      if (!res.ok) throw new Error("Failed to load rules");
      return ((await res.json()) as { rules: SnagPolicyRule[] }).rules;
    },
  });
  const [template, setTemplate] = useState<PolicyTemplate | null>(null);
  const [drafts, setDrafts] = useState<DraftRule[]>([]);
  const [scope, setScope] = useState<"project" | "organization">("project");
  const [shadow, setShadow] = useState(false);
  const [saving, setSaving] = useState(false);

  const existingNames = new Set(existing.map((rule) => rule.name.trim().toLowerCase()));

  function discard() {
    setTemplate(null);
    setDrafts([]);
    setScope("project");
    setShadow(false);
  }

  async function save() {
    if (!template) return;
    if (drafts.some((rule) => !rule.name.trim())) {
      toast.error("Every rule needs a name.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/projects/${projectSlug}/rules/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        template_id: template.id,
        rules: drafts.map((rule) => ({
          name: rule.name.trim(),
          kind: rule.outcome === "execute" ? "allow" : "escalate",
          outcome: rule.outcome,
          enabled: true,
          shadow,
          condition: { all: rule.conditions.map((c) => c.condition) },
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(
        typeof body.error === "string"
          ? body.error
          : "Check the rules: every condition needs a value. Nothing was saved.",
      );
      return;
    }
    toast.success(`${template.name} saved: ${drafts.length} rules`);
    discard();
    void queryClient.invalidateQueries({ queryKey: ["policy-rules", projectSlug] });
  }

  if (!template) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Start from a template</CardTitle>
          <CardDescription>
            Fills in a set of rules for you to review. Nothing is saved until you click Save.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {POLICY_TEMPLATES.map((item) => (
            <TemplateCard
              key={item.id}
              template={item}
              onUse={() => {
                setTemplate(item);
                setDrafts(draftFromTemplate(item));
              }}
            />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Review {template.name}
          <Badge variant="warning">Not saved yet</Badge>
        </CardTitle>
        <CardDescription>
          Edit or remove anything below, then save. These rules are added next to your existing
          rules; the strictest matching rule always wins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="template_scope">Applies to</Label>
            <select
              id="template_scope"
              className={selectClassName}
              value={scope}
              onChange={(e) => setScope(e.target.value as "project" | "organization")}
            >
              <option value="project">This project</option>
              <option value="organization">Every project in the organization</option>
            </select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
            <div>
              <p className="text-sm font-medium">Start in shadow mode</p>
              <p className="text-xs text-zinc-500">
                Record what the rules would do without enforcing them.
              </p>
            </div>
            <Switch checked={shadow} onCheckedChange={setShadow} />
          </div>
        </div>
        <ul className="space-y-3">
          {drafts.map((rule) => (
            <DraftRuleEditor
              key={rule.key}
              rule={rule}
              duplicate={existingNames.has(rule.name.trim().toLowerCase())}
              onChange={(next) =>
                setDrafts(drafts.map((d) => (d.key === rule.key ? next : d)))
              }
              onRemove={() => setDrafts(drafts.filter((d) => d.key !== rule.key))}
            />
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void save()} disabled={saving || drafts.length === 0}>
            {saving ? "Saving…" : `Save ${drafts.length} rules`}
          </Button>
          <Button type="button" variant="ghost" onClick={discard} disabled={saving}>
            Discard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

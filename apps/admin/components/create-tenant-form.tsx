"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createTenantSchema, parseOriginsTextarea } from "@snag/shared";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AgentModeSelect } from "@/components/agent-mode-select";
import { AllowedOriginsField, DEFAULT_ORIGINS_TEXTAREA } from "@/components/allowed-origins-field";
import { RequesterFollowupsSwitch } from "@/components/requester-followups-select";

type FormValues = z.infer<typeof createTenantSchema>;

export type TenantOrganizationOption = {
  id: string;
  name: string;
  slug: string;
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function firstApiError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const flat = error as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | undefined>;
    };
    const field = Object.values(flat.fieldErrors ?? {})
      .flat()
      .find((message) => Boolean(message));
    return flat.formErrors?.[0] ?? field ?? "Failed to create tenant";
  }
  return "Failed to create tenant";
}

export function CreateTenantForm({
  organizations,
}: {
  organizations: TenantOrganizationOption[];
}) {
  const router = useRouter();
  const [allowedOriginsText, setAllowedOriginsText] = useState(DEFAULT_ORIGINS_TEXTAREA);
  const form = useForm<FormValues>({
    resolver: zodResolver(createTenantSchema),
    defaultValues: {
      organization_id: "",
      org_name: "",
      org_slug: "",
      project_name: "",
      project_slug: "",
      repo_url: "",
      repo_ref: "main",
      prompt_instructions: "",
      cursor_api_key: "",
      owner_email: "",
      per_ip_hourly_limit: 10,
      hourly_limit: 10,
      daily_limit: 30,
      agent_mode: "plan_only",
      requester_followups_enabled: true,
    },
  });

  async function onSubmit(values: FormValues) {
    const res = await fetch("/api/platform/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        allowed_origins: parseOriginsTextarea(allowedOriginsText),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(firstApiError(body.error));
      return;
    }
    toast.success(values.organization_id ? "Project added" : "Tenant created");
    router.push(`/platform/tenants/${body.project.slug}`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New tenant</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
          <OrganizationSelect
            organizations={organizations}
            value={form.watch("organization_id") ?? ""}
            onChange={(organizationId) => form.setValue("organization_id", organizationId)}
          />
          {form.watch("organization_id") ? null : (
            <>
              <div className="space-y-2">
                <Label>Organization name</Label>
                <Input {...form.register("org_name")} />
              </div>
              <div className="space-y-2">
                <Label>Organization slug</Label>
                <Input {...form.register("org_slug")} placeholder="acme" />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Project name</Label>
            <Input {...form.register("project_name")} />
          </div>
          <div className="space-y-2">
            <Label>Project slug</Label>
            <Input {...form.register("project_slug")} placeholder="acme-web" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Repository URL</Label>
            <Input
              {...form.register("repo_url")}
              placeholder="https://github.com/org/repo or https://origin.cursor.com/org/repo"
            />
          </div>
          <div className={form.watch("organization_id") ? "space-y-2 sm:col-span-2" : "space-y-2"}>
            <Label>Branch</Label>
            <Input {...form.register("repo_ref")} />
          </div>
          {form.watch("organization_id") ? null : (
            <div className="space-y-2">
              <Label>Owner email</Label>
              <Input type="email" {...form.register("owner_email")} />
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label>Cursor API key</Label>
            <Input type="password" className="font-mono" {...form.register("cursor_api_key")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Prompt instructions</Label>
            <Textarea rows={4} {...form.register("prompt_instructions")} />
          </div>
          <div className="sm:col-span-2">
            <AllowedOriginsField
              id="create_allowed_origins"
              value={allowedOriginsText}
              onChange={setAllowedOriginsText}
            />
          </div>
          {form.watch("organization_id") ? (
            <p className="text-sm text-zinc-500 sm:col-span-2">
              This project inherits the organization&apos;s agent mode and requester follow-ups.
            </p>
          ) : (
            <>
              <div className="sm:col-span-2">
                <AgentModeSelect
                  id="create_tenant_agent_mode"
                  value={form.watch("agent_mode")}
                  onChange={(mode) => form.setValue("agent_mode", mode)}
                />
              </div>
              <div className="sm:col-span-2">
                <RequesterFollowupsSwitch
                  id="create_tenant_requester_followups"
                  checked={form.watch("requester_followups_enabled")}
                  onCheckedChange={(value) =>
                    form.setValue("requester_followups_enabled", value)
                  }
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Per-IP hourly limit</Label>
            <Input type="number" {...form.register("per_ip_hourly_limit", { valueAsNumber: true })} />
          </div>
          <div className="space-y-2">
            <Label>Hourly limit</Label>
            <Input type="number" {...form.register("hourly_limit", { valueAsNumber: true })} />
          </div>
          <div className="space-y-2">
            <Label>Daily limit</Label>
            <Input type="number" {...form.register("daily_limit", { valueAsNumber: true })} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Creating…"
                : form.watch("organization_id")
                  ? "Add project"
                  : "Create tenant"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function OrganizationSelect({
  organizations,
  value,
  onChange,
}: {
  organizations: TenantOrganizationOption[];
  value: string;
  onChange: (organizationId: string) => void;
}) {
  const selected = organizations.find((organization) => organization.id === value);

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor="create_tenant_organization">Organization</Label>
      <select
        id="create_tenant_organization"
        className={selectClassName}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">New organization</option>
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name} ({organization.slug})
          </option>
        ))}
      </select>
      <p className="text-sm text-zinc-500">
        {selected
          ? `Adds a project to ${selected.name}.`
          : "Creates a new organization along with this project."}
      </p>
    </div>
  );
}

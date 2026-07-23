"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createTenantSchema } from "@snag/shared";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AgentModeSelect } from "@/components/agent-mode-select";

type FormValues = z.infer<typeof createTenantSchema>;

export function CreateTenantForm() {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(createTenantSchema),
    defaultValues: {
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
    },
  });

  async function onSubmit(values: FormValues) {
    const res = await fetch("/api/platform/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error?.formErrors?.[0] ?? body.error ?? "Failed to create tenant");
      return;
    }
    toast.success("Tenant created");
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
          <div className="space-y-2">
            <Label>Organization name</Label>
            <Input {...form.register("org_name")} />
          </div>
          <div className="space-y-2">
            <Label>Organization slug</Label>
            <Input {...form.register("org_slug")} placeholder="acme" />
          </div>
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
            <Input {...form.register("repo_url")} placeholder="https://github.com/org/repo" />
          </div>
          <div className="space-y-2">
            <Label>Branch</Label>
            <Input {...form.register("repo_ref")} />
          </div>
          <div className="space-y-2">
            <Label>Owner email</Label>
            <Input type="email" {...form.register("owner_email")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Cursor API key</Label>
            <Input type="password" className="font-mono" {...form.register("cursor_api_key")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Prompt instructions</Label>
            <Textarea rows={4} {...form.register("prompt_instructions")} />
          </div>
          <div className="sm:col-span-2">
            <AgentModeSelect
              id="create_tenant_agent_mode"
              value={form.watch("agent_mode")}
              onChange={(mode) => form.setValue("agent_mode", mode)}
            />
          </div>
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
              {form.formState.isSubmitting ? "Creating…" : "Create tenant"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

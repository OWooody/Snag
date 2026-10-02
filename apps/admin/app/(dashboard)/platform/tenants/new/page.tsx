import { CreateTenantForm } from "@/components/create-tenant-form";
import { requirePlatformAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/service";

export default async function NewTenantPage() {
  await requirePlatformAdmin();
  const service = createServiceClient();
  const { data: organizations } = await service
    .from("snag_organizations")
    .select("id, name, slug")
    .order("name", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create tenant</h1>
        <p className="text-sm text-zinc-500">
          Provision a project on a new or existing organization.
        </p>
      </div>
      <CreateTenantForm organizations={organizations ?? []} />
    </div>
  );
}

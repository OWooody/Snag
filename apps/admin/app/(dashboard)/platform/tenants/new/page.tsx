import { CreateTenantForm } from "@/components/create-tenant-form";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function NewTenantPage() {
  await requirePlatformAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create tenant</h1>
        <p className="text-sm text-zinc-500">Provision a new organization and project.</p>
      </div>
      <CreateTenantForm />
    </div>
  );
}

import { AppShell } from "@/components/app-shell";
import { getUserContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getUserContext();

  return (
    <AppShell
      email={ctx.email}
      isPlatformAdmin={ctx.isPlatformAdmin}
      impersonating={Boolean(ctx.impersonatingOrgId)}
    >
      {children}
    </AppShell>
  );
}

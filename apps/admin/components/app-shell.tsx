"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Plug,
  Server,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  email: string;
  isPlatformAdmin: boolean;
  impersonating: boolean;
  projectSlug?: string;
}

const companyLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/requests", label: "Requests", icon: FileText },
  { href: "/rules", label: "Rules", icon: ShieldCheck },
  { href: "/integration", label: "Integration", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

const platformLinks = [
  { href: "/platform/tenants", label: "Tenants", icon: Users },
  { href: "/platform/requests", label: "All requests", icon: FileText },
  { href: "/platform/system", label: "System", icon: Server },
];

export function AppShell({
  children,
  email,
  isPlatformAdmin,
  impersonating,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-60 shrink-0 border-r border-zinc-200 bg-white md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-4">
          <Building2 className="h-5 w-5" />
          <span className="font-semibold">Snag Admin</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {companyLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-zinc-100 font-medium" : "text-zinc-600 hover:bg-zinc-50",
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
          {isPlatformAdmin && (
            <>
              <Separator className="my-2" />
              <p className="px-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Platform
              </p>
              {platformLinks.map((link) => {
                const Icon = link.icon;
                const active = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      active ? "bg-zinc-100 font-medium" : "text-zinc-600 hover:bg-zinc-50",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>
        <div className="border-t border-zinc-200 p-3">
          <p className="truncate px-3 text-xs text-zinc-500">{email}</p>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            Viewing as company (read-only impersonation).{" "}
            <Link href="/platform/stop-impersonate" className="underline">
              Exit impersonation
            </Link>
          </div>
        )}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

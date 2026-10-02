"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown, LogOut, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface TenantOption {
  slug: string;
  name: string;
  organizationName: string | null;
}

interface TenantSwitcherProps {
  tenants: TenantOption[];
  activeSlug: string | null;
}

export function TenantSwitcher({ tenants, activeSlug }: TenantSwitcherProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const active = tenants.find((t) => t.slug === activeSlug) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) =>
      [t.name, t.slug, t.organizationName ?? ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [tenants, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function switchTo(slug: string) {
    const form = formRef.current;
    if (!form || slug === activeSlug) return;
    setPendingSlug(slug);
    form.action = `/platform/impersonate/${encodeURIComponent(slug)}`;
    form.requestSubmit();
  }

  return (
    <>
      {/* POST, not a link: Next.js prefetches visible links with GET, which would start impersonation silently. */}
      <form ref={formRef} method="post" className="hidden">
        <input type="hidden" name="next" value={pathname} />
      </form>

      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
              active
                ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
                : "border-zinc-200 bg-white hover:bg-zinc-50",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                {active ? "Viewing as" : "Tenant"}
              </span>
              <span className="block truncate font-medium text-zinc-900">
                {pendingSlug
                  ? "Switching…"
                  : active
                    ? active.name
                    : "Select a tenant…"}
              </span>
              {active?.organizationName && !pendingSlug ? (
                <span className="block truncate text-xs text-zinc-500">
                  {active.organizationName}
                </span>
              ) : null}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 w-72 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-zinc-100 px-3">
              <Search className="h-4 w-4 shrink-0 text-zinc-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Keep Radix typeahead from stealing keystrokes; let arrows/Escape through for navigation.
                  if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(e.key)) {
                    e.stopPropagation();
                  }
                  if (e.key === "Enter" && filtered.length === 1) {
                    e.preventDefault();
                    switchTo(filtered[0].slug);
                  }
                }}
                placeholder="Search tenants…"
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
              />
            </div>

            <div className="max-h-80 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-zinc-500">No tenants found.</p>
              ) : (
                filtered.map((tenant) => {
                  const isActive = tenant.slug === activeSlug;
                  return (
                    <DropdownMenu.Item
                      key={tenant.slug}
                      onSelect={() => switchTo(tenant.slug)}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-zinc-100"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{tenant.name}</span>
                        <span className="block truncate text-xs text-zinc-500">
                          {tenant.organizationName ?? "—"} ·{" "}
                          <span className="font-mono">{tenant.slug}</span>
                        </span>
                      </span>
                      {isActive ? <Check className="h-4 w-4 shrink-0 text-zinc-700" /> : null}
                    </DropdownMenu.Item>
                  );
                })
              )}
            </div>

            {active ? (
              <>
                <DropdownMenu.Separator className="h-px bg-zinc-100" />
                <div className="p-1">
                  <DropdownMenu.Item asChild>
                    <a
                      href="/platform/stop-impersonate"
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-600 outline-none data-[highlighted]:bg-zinc-100"
                    >
                      <LogOut className="h-4 w-4" />
                      Exit impersonation
                    </a>
                  </DropdownMenu.Item>
                </div>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}

"use client";

import {
  ORG_MEMBER_ROLE_DESCRIPTIONS,
  ORG_MEMBER_ROLE_LABELS,
  assignableOrgMemberRoles,
  canChangeOrgMember,
  type OrgMemberManageLevel,
  type OrgMemberRole,
  type SnagOrgMemberListItem,
} from "@snag/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClassName =
  "flex h-9 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function errorMessage(body: { error?: unknown }, fallback: string): string {
  return typeof body.error === "string" ? body.error : fallback;
}

export function MembersCard({
  organizationId,
  members,
  level,
  currentUserId,
}: {
  organizationId: string;
  members: SnagOrgMemberListItem[];
  /** Null renders the list read-only. */
  level: OrgMemberManageLevel | null;
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgMemberRole>("viewer");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SnagOrgMemberListItem | null>(null);

  const assignable = level ? assignableOrgMemberRoles(level) : [];
  const baseUrl = `/api/organizations/${organizationId}/members`;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const body = await res.json().catch(() => ({}));
    setInviting(false);
    if (!res.ok) {
      toast.error(errorMessage(body, "Failed to add member"));
      return;
    }
    toast.success(
      body.active
        ? `${email} added as ${ORG_MEMBER_ROLE_LABELS[role].toLowerCase()}`
        : `Invite sent to ${email}`,
    );
    setEmail("");
    setRole("viewer");
    router.refresh();
  }

  async function changeRole(member: SnagOrgMemberListItem, next: OrgMemberRole) {
    setBusyId(member.id);
    const res = await fetch(`${baseUrl}/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    const body = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      toast.error(errorMessage(body, "Failed to change role"));
      return;
    }
    toast.success(`${member.email} is now ${ORG_MEMBER_ROLE_LABELS[next].toLowerCase()}`);
    router.refresh();
  }

  async function remove(member: SnagOrgMemberListItem) {
    setBusyId(member.id);
    const res = await fetch(`${baseUrl}/${member.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setBusyId(null);
    setRemoving(null);
    if (!res.ok) {
      toast.error(errorMessage(body, "Failed to remove member"));
      return;
    }
    toast.success(member.active ? `${member.email} removed` : `Invite for ${member.email} revoked`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Owners and admins manage settings and approvals. Viewers have read-only access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {members.length === 0 ? (
          <p className="text-sm text-zinc-500">No members yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {members.map((member) => {
              const editable = level !== null && canChangeOrgMember(level, member.role);
              const isSelf = member.user_id === currentUserId;
              return (
                <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.email || "Unknown user"}
                      {isSelf && <span className="ml-2 text-zinc-500">(you)</span>}
                    </p>
                  </div>
                  {!member.active && <Badge variant="warning">Invited</Badge>}
                  {editable ? (
                    <>
                      <select
                        aria-label={`Role for ${member.email}`}
                        className={selectClassName}
                        value={member.role}
                        disabled={busyId === member.id}
                        onChange={(e) => changeRole(member, e.target.value as OrgMemberRole)}
                      >
                        {assignable.map((r) => (
                          <option key={r} value={r}>
                            {ORG_MEMBER_ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === member.id}
                        onClick={() => setRemoving(member)}
                      >
                        {member.active ? "Remove" : "Revoke"}
                      </Button>
                    </>
                  ) : (
                    <Badge variant="secondary">{ORG_MEMBER_ROLE_LABELS[member.role]}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {level && (
          <form onSubmit={invite} className="space-y-2">
            <Label htmlFor="member_email">Add a member</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="member_email"
                type="email"
                required
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-w-0 flex-1"
              />
              <select
                aria-label="Role"
                className={selectClassName}
                value={role}
                onChange={(e) => setRole(e.target.value as OrgMemberRole)}
              >
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {ORG_MEMBER_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={inviting || !email.trim()}>
                {inviting ? "Adding…" : "Add"}
              </Button>
            </div>
            <p className="text-sm text-zinc-500">
              {ORG_MEMBER_ROLE_DESCRIPTIONS[role]} New people get an email invite; existing Snag
              users get access right away.
            </p>
          </form>
        )}
      </CardContent>

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing?.active ? "Remove member?" : "Revoke invite?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.user_id === currentUserId
                ? "You will lose access to this organization."
                : `${removing?.email} will lose access to this organization.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                if (removing) void remove(removing);
              }}
            >
              {removing?.active ? "Remove" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

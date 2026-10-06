import type { OrgMemberRole } from "./types";

export const ORG_MEMBER_ROLES = ["owner", "admin", "viewer"] as const satisfies readonly OrgMemberRole[];

export const ORG_MEMBER_ROLE_LABELS: Record<OrgMemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  viewer: "Viewer",
};

export const ORG_MEMBER_ROLE_DESCRIPTIONS: Record<OrgMemberRole, string> = {
  owner: "Everything an admin can do, plus managing owners.",
  admin: "Edits settings, keys, and rules, approves plans, and manages admins and viewers.",
  viewer: "Read-only access to the dashboard, requests, rules, and integration.",
};

/**
 * What the acting user may do to memberships. "owner" covers org owners and
 * platform admins; "admin" may not grant, change, or remove owners.
 */
export type OrgMemberManageLevel = "owner" | "admin";

export function assignableOrgMemberRoles(level: OrgMemberManageLevel): OrgMemberRole[] {
  return level === "owner" ? [...ORG_MEMBER_ROLES] : ["admin", "viewer"];
}

export function canChangeOrgMember(level: OrgMemberManageLevel, memberRole: OrgMemberRole): boolean {
  return level === "owner" || memberRole !== "owner";
}

export interface SnagOrgMemberListItem {
  id: string;
  user_id: string | null;
  email: string;
  role: OrgMemberRole;
  /** False while the invite is pending (the person has not signed in yet). */
  active: boolean;
  created_at: string;
}

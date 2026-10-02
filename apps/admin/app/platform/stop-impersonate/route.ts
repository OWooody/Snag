import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { setImpersonationCookies } from "@/lib/impersonation";

export async function GET(request: Request) {
  const ctx = await requirePlatformAdmin();
  const base = new URL(request.url).origin;

  if (ctx.impersonatingOrgId) {
    await writeAuditLog({
      actorId: ctx.userId,
      action: "impersonation.stop",
      targetType: "snag_organizations",
      targetId: ctx.impersonatingOrgId,
      metadata: {},
    });
  }

  const response = NextResponse.redirect(`${base}/platform/tenants`);
  setImpersonationCookies(response, null);
  return response;
}

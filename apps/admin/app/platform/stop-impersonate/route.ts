import { NextResponse } from "next/server";
import { IMPERSONATE_COOKIE } from "@/lib/impersonation";
import { requirePlatformAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  await requirePlatformAdmin();
  const base = new URL(request.url).origin;
  const response = NextResponse.redirect(`${base}/platform/tenants`);
  response.cookies.set(IMPERSONATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

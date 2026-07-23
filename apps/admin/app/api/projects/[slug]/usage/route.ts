import { NextResponse } from "next/server";
import { canManageProject, getProjectBySlug, isPlatformAdminUser, requireSessionUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/service";
import { computeUsageStats } from "@/lib/requests";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { user, error } = await requireSessionUser();
  if (error) return error;

  const isPlatform = await isPlatformAdminUser(user!.id);
  const canManage = await canManageProject(user!.id, slug);
  if (!isPlatform && !canManage) {
    const service = createServiceClient();
    const { data: memberProject } = await service
      .from("snag_projects")
      .select("organization_id")
      .eq("slug", slug)
      .single();
    if (memberProject?.organization_id) {
      const { data: viewer } = await service
        .from("snag_org_members")
        .select("role")
        .eq("organization_id", memberProject.organization_id)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!viewer) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const project = await getProjectBySlug(slug);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const service = createServiceClient();
  const { data: requests } = await service
    .from("snag_requests")
    .select("id, status, created_at, pr_url")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(500);

  const stats = computeUsageStats(
    (requests ?? []).map((r) => ({
      ...r,
      project_id: project.id,
      requester: null,
      prompt: "",
      agent_url: null,
      branch_name: null,
      summary: null,
      error: null,
      updated_at: r.created_at,
    })),
  );

  return NextResponse.json({
    limits: {
      per_ip_hourly: project.per_ip_hourly_limit,
      hourly: project.hourly_limit,
      daily: project.daily_limit,
    },
    usage: stats,
  });
}

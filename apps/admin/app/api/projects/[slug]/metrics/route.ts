import type { ExecuteMetrics } from "@snag/shared";
import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-route";
import { createServiceClient } from "@/lib/service";

const ALLOWED_DAYS = new Set([7, 30]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug, "read");
  if (access.response) return access.response;

  const days = Number(new URL(request.url).searchParams.get("days") ?? 7);
  if (!ALLOWED_DAYS.has(days)) {
    return NextResponse.json({ error: "days must be 7 or 30" }, { status: 400 });
  }

  const { data, error } = await createServiceClient().rpc("snag_execute_metrics", {
    p_project_id: access.project.id,
    p_days: days,
  });
  if (error) {
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }
  return NextResponse.json(data as ExecuteMetrics);
}

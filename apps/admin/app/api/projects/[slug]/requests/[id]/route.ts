import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-route";
import { REQUEST_COLUMNS } from "@/lib/requests";
import { createServiceClient } from "@/lib/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const access = await requireProjectAccess(slug, "read");
  if (access.response) return access.response;

  const service = createServiceClient();
  const { data, error } = await service
    .from("snag_requests")
    .select(REQUEST_COLUMNS)
    .eq("id", id)
    .eq("project_id", access.project.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load request" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

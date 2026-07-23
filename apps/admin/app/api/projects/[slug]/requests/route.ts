import { NextResponse } from "next/server";
import { canReadProject, getProjectBySlug, requireSessionUser } from "@/lib/api-auth";
import { fetchProjectRequests } from "@/lib/requests";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { user, error } = await requireSessionUser();
  if (error) return error;

  if (!(await canReadProject(user!.id, slug))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await getProjectBySlug(slug);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requests = await fetchProjectRequests(project.id, 100, { useServiceRole: true });
  return NextResponse.json(requests);
}

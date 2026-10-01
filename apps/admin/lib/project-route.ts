import { assertEncryptionSecret } from "@snag/shared";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  canAdministerProject,
  canReadProject,
  getProjectBySlug,
  requireSessionUser,
} from "@/lib/api-auth";

type ProjectRecord = NonNullable<Awaited<ReturnType<typeof getProjectBySlug>>>;

type ProjectAccess =
  | { user: User; project: ProjectRecord; response: null }
  | { user: null; project: null; response: NextResponse };

/**
 * Session + role gate for project-scoped routes. `project` is the full row
 * (including encrypted columns) — never return it to the client.
 */
export async function requireProjectAccess(
  slug: string,
  level: "admin" | "read",
): Promise<ProjectAccess> {
  const { user, error } = await requireSessionUser();
  if (error) return { user: null, project: null, response: error };

  const allowed =
    level === "admin"
      ? await canAdministerProject(user!.id, slug)
      : await canReadProject(user!.id, slug);
  if (!allowed) {
    return {
      user: null,
      project: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const project = await getProjectBySlug(slug);
  if (!project) {
    return {
      user: null,
      project: null,
      response: NextResponse.json({ error: "Project not found" }, { status: 404 }),
    };
  }
  return { user: user!, project, response: null };
}

export function encryptionSecretOrError():
  | { secret: string; response: null }
  | { secret: null; response: NextResponse } {
  try {
    return {
      secret: assertEncryptionSecret(process.env.SNAG_KEY_ENCRYPTION_SECRET),
      response: null,
    };
  } catch (e) {
    return {
      secret: null,
      response: NextResponse.json(
        { error: e instanceof Error ? e.message : "Encryption not configured" },
        { status: 500 },
      ),
    };
  }
}

import { encryptSecret, githubTokenUpdateSchema } from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { encryptionSecretOrError, requireProjectAccess } from "@/lib/project-route";
import { createServiceClient } from "@/lib/service";

function repoPath(repoUrl: string): string | null {
  const match = repoUrl.match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

/** Confirms the token can see the project repository before it is stored. */
async function verifyTokenRepoAccess(token: string, repoUrl: string): Promise<string | null> {
  const path = repoPath(repoUrl);
  if (!path) return "The project repository URL is not a GitHub repository.";
  try {
    const res = await fetch(`https://api.github.com/repos/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (res.status === 401) return "GitHub rejected the token.";
    if (res.status === 403 || res.status === 404) {
      return `The token cannot access ${path}. Grant it access to this repository.`;
    }
    if (!res.ok) return null;
    const repo = (await res.json().catch(() => null)) as {
      permissions?: { push?: boolean };
    } | null;
    if (repo?.permissions && repo.permissions.push === false) {
      return `The token has read-only access to ${path}. Snag needs Contents and Pull requests write access to merge.`;
    }
    return null;
  } catch {
    // GitHub unreachable: store anyway; the delivery worker hands off on auth errors.
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug, "admin");
  if (access.response) return access.response;
  const { user, project } = access;

  const body = await request.json().catch(() => null);
  const parsed = githubTokenUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const encryption = encryptionSecretOrError();
  if (encryption.response) return encryption.response;

  const problem = await verifyTokenRepoAccess(parsed.data.github_token, project.repo_url);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const encrypted = await encryptSecret(parsed.data.github_token, encryption.secret);
  const now = new Date().toISOString();
  const service = createServiceClient();
  const { error: updateError } = await service
    .from("snag_projects")
    .update({ github_token_encrypted: encrypted, github_token_updated_at: now, updated_at: now })
    .eq("id", project.id);
  if (updateError) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "project.github_token_rotate",
    targetType: "snag_projects",
    targetId: project.id,
    metadata: { slug },
  });

  return NextResponse.json({ ok: true, github_token_updated_at: now });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug, "admin");
  if (access.response) return access.response;
  const { user, project } = access;

  const service = createServiceClient();
  const { error: updateError } = await service
    .from("snag_projects")
    .update({
      github_token_encrypted: null,
      github_token_updated_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id);
  if (updateError) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "project.github_token_remove",
    targetType: "snag_projects",
    targetId: project.id,
    metadata: { slug },
  });

  return NextResponse.json({ ok: true });
}
